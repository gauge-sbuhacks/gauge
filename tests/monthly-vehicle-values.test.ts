import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';
import { request } from 'node:http';
import { nextVehicleRefresh } from '../shared/vehicleUpdates.ts';
import type { VehicleValueResult } from '../shared/schemas.ts';
import { Asset, Valuation, toAssetRecord, type AssetDoc, type WithId } from '../server/db/models.ts';
import { errorHandler } from '../server/errors.ts';
import { claimVehicleRefresh, refreshClaimedVehicle, runMonthlyVehicleRefreshes, settingsAfterVehicleValue, trackingSettings } from '../server/vehicles/monthly.ts';
import { vehicleCronRouter, vehicleUpdatesRouter } from '../server/routes/vehicle-updates.ts';
import { assetsRouter } from '../server/routes/assets.ts';

const now = new Date('2026-11-25T12:00:00Z');
const vehicle = (): WithId<AssetDoc> => ({
    _id: new mongoose.Types.ObjectId('123456789012345678901234'), ownerId: 'owner-a', name: 'XT6', category: 'vehicle',
    brand: 'Cadillac', model: 'XT6', condition: 'good', currency: 'USD', location: null, serialNumber: null,
    purchaseDate: null, purchasePriceCents: null, notes: null, details: { year: 2020, mileage: 45000 }, photos: [], isSample: false,
    createdAt: new Date('2026-10-25T12:00:00Z'), updatedAt: now,
    vehicleValueUpdates: { valueTypes: ['fair_market', 'liquidation'], trim: 'Premium Luxury',
        nextRefreshAt: now, cycleAt: now, lastRefreshedAt: new Date('2026-10-25T12:00:00Z'), lastAttemptAt: now, lastError: null,
        leaseUntil: new Date(now.getTime() + 600000), leaseToken: 'lease-a' }
});
const result = (): VehicleValueResult => ({
    provider: 'vinaudit', providerLabel: 'VinAudit', fetchedAt: now.toISOString(), vehicle: '2020 Cadillac XT6', mileage: 45000,
    retail: { valueCents: 2700000, lowCents: 2300000, highCents: 3100000, sampleCount: 74, certainty: 99 },
    tradeIn: { valueCents: 2000000, lowCents: 1700000, highCents: 2300000, sampleCount: 74, certainty: 99 },
    period: null, adjustments: [], notes: ['Reference trim assumptions remain visible.']
});

test('monthly dates clamp short months, preserve time, and handle leap years and year boundaries', () => {
    assert.equal(nextVehicleRefresh(new Date('2026-01-31T15:45:00Z')).toISOString(), '2026-02-28T15:45:00.000Z');
    assert.equal(nextVehicleRefresh(new Date('2028-01-31T15:45:00Z')).toISOString(), '2028-02-29T15:45:00.000Z');
    assert.equal(nextVehicleRefresh(new Date('2026-12-25T12:00:00Z')).toISOString(), '2027-01-25T12:00:00.000Z');
});

test('saving an opted-in provider estimate schedules next month, while manual values stop only their type', () => {
    const asset = vehicle();
    const enabled = settingsAfterVehicleValue(asset, { valueType: 'fair_market', source: 'provider', sourceName: 'VinAudit retail', monthlyVehicleUpdates: true, vehicleTrim: 'Sport' }, now)!;
    assert.equal(enabled.nextRefreshAt?.toISOString(), '2026-12-25T12:00:00.000Z');
    assert.equal(enabled.trim, 'Sport');
    assert.equal(enabled.leaseToken, null);
    const manual = settingsAfterVehicleValue(asset, { valueType: 'fair_market', source: 'user' }, now)!;
    assert.deepEqual(manual.valueTypes, ['liquidation']);
    assert.equal(manual.nextRefreshAt?.toISOString(), now.toISOString());
    const disabled = settingsAfterVehicleValue({ ...asset, vehicleValueUpdates: manual }, { valueType: 'liquidation', source: 'appraisal' }, now)!;
    assert.deepEqual(disabled.valueTypes, []);
    assert.equal(disabled.nextRefreshAt, null);
    assert.equal(disabled.leaseToken, null);
    assert.equal(settingsAfterVehicleValue({ ...asset, vehicleValueUpdates: null }, { valueType: 'fair_market', source: 'user' }, now), null);
});

test('tracking rejects unsupported assets, invalid identity and arbitrary provider attribution', () => {
    const asset = vehicle();
    assert.throws(() => trackingSettings({ ...asset, isSample: true }, ['fair_market'], now), /real vehicle/);
    assert.throws(() => trackingSettings({ ...asset, currency: 'EUR' }, ['fair_market'], now), /USD/);
    assert.throws(() => trackingSettings({ ...asset, details: {} }, ['fair_market'], now));
    assert.throws(() => settingsAfterVehicleValue(asset, { valueType: 'fair_market', source: 'provider', sourceName: 'Other site', monthlyVehicleUpdates: true }, now), /VinAudit/);
});

test('asset serialization exposes schedule status but never lease credentials or private provider inputs', () => {
    const serialized = toAssetRecord(vehicle());
    assert.equal(serialized.vehicleValueUpdates?.nextRefreshAt, now.toISOString());
    assert.equal('leaseToken' in serialized.vehicleValueUpdates!, false);
    assert.equal('trim' in serialized.vehicleValueUpdates!, false);
});

test('claims require due dates and an expired lease; requested refreshes remain owner-scoped', async (t) => {
    t.mock.method(Asset, 'findOneAndUpdate', (filter: any, update: any, options: any) => {
        assert.equal(filter.ownerId, 'owner-a');
        assert.equal(filter._id, '123456789012345678901234');
        assert.deepEqual(filter['vehicleValueUpdates.nextRefreshAt'], { $ne: null, $lte: now });
        assert.equal(filter.isSample, false);
        assert.ok(filter.$or.some((x: any) => x['vehicleValueUpdates.leaseUntil']?.$lte === now));
        assert.equal(options.returnDocument, 'after');
        assert.ok(update.$set['vehicleValueUpdates.leaseUntil'] > now);
        return { lean: async () => null };
    });
    assert.equal(await claimVehicleRefresh(now, { assetId: '123456789012345678901234', ownerId: 'owner-a' }), null);
});

test('refreshes append dated values of the selected types using stored mileage and selected trim', async (t) => {
    const asset = vehicle();
    const saved: any[] = [], updates: any[] = [];
    t.mock.method(Asset, 'findOne', (filter: any) => {
        assert.equal(filter.ownerId, asset.ownerId);
        assert.equal(filter['vehicleValueUpdates.leaseToken'], 'lease-a');
        return { lean: async () => asset };
    });
    t.mock.method(Valuation, 'updateOne', async (filter: any, update: any, options: any) => {
        assert.equal(options.upsert, true);
        assert.equal(update.$setOnInsert.automaticRefreshKey, filter.automaticRefreshKey);
        saved.push(update.$setOnInsert);
        return {};
    });
    t.mock.method(Asset, 'updateOne', async (_filter: any, update: any) => { updates.push(update.$set); return {}; });
    const refreshed = await refreshClaimedVehicle(asset, now, async (query) => {
        assert.equal(query.mileage, 45000);
        assert.equal(query.trim, 'Premium Luxury');
        assert.equal(query.year, 2020);
        return result();
    });
    assert.equal(refreshed.status, 'updated');
    assert.deepEqual(saved.map((value) => value.valueType), ['fair_market', 'liquidation']);
    assert.equal(saved[0].source, 'provider');
    assert.equal(saved[0].observedAt, '2026-11-25');
    assert.match(saved[0].notes, /45,000 miles/);
    assert.match(saved[0].notes, /Reference trim/);
    assert.equal(updates[0]['vehicleValueUpdates.nextRefreshAt'].toISOString(), '2026-12-25T12:00:00.000Z');
});

test('provider failure retains prior values and schedules a retry without exposing upstream secrets', async (t) => {
    let saved = 0;
    t.mock.method(Valuation, 'updateOne', async () => { saved++; });
    t.mock.method(Asset, 'updateOne', async (_filter: any, update: any) => {
        assert.equal(update.$set['vehicleValueUpdates.nextRefreshAt'].toISOString(), '2026-11-26T12:00:00.000Z');
        assert.equal(update.$set['vehicleValueUpdates.lastRefreshedAt'], undefined);
        assert.doesNotMatch(update.$set['vehicleValueUpdates.lastError'], /secret-api-key/);
        return {};
    });
    const refreshed = await refreshClaimedVehicle(vehicle(), now, async () => { throw new Error('secret-api-key'); });
    assert.equal(refreshed.status, 'failed');
    assert.equal(saved, 0);
});

test('turning updates off during an in-flight request prevents a new valuation', async (t) => {
    t.mock.method(Asset, 'findOne', () => ({ lean: async () => null }));
    t.mock.method(Valuation, 'updateOne', async () => assert.fail('canceled refresh cannot write a value'));
    assert.equal((await refreshClaimedVehicle(vehicle(), now, async () => result())).status, 'skipped');
});

test('a retry after a partial write reuses durable cycle keys instead of duplicating history', async (t) => {
    const asset = vehicle();
    const saved = new Map<string, any>();
    let failCommit = true;
    t.mock.method(Asset, 'findOne', () => ({ lean: async () => asset }));
    t.mock.method(Valuation, 'updateOne', async (filter: any, update: any) => {
        if (!saved.has(filter.automaticRefreshKey)) saved.set(filter.automaticRefreshKey, update.$setOnInsert);
        return {};
    });
    t.mock.method(Asset, 'updateOne', async (_filter: any, update: any) => {
        if (failCommit && update.$set['vehicleValueUpdates.lastRefreshedAt']) { failCommit = false; throw new Error('commit failed'); }
        return {};
    });
    assert.equal((await refreshClaimedVehicle(asset, now, async () => result())).status, 'failed');
    asset.vehicleValueUpdates!.nextRefreshAt = new Date('2026-11-26T12:00:00Z');
    assert.equal((await refreshClaimedVehicle(asset, new Date('2026-11-26T12:00:00Z'), async () => result())).status, 'updated');
    assert.equal(saved.size, 2);
});

test('a daily scheduler invocation with no due vehicles makes no external requests', async (t) => {
    const previous = process.env.VINAUDIT_API_KEY;
    process.env.VINAUDIT_API_KEY = 'monthly-test-key';
    t.mock.method(Valuation, 'init', async () => Valuation);
    t.mock.method(Asset, 'findOneAndUpdate', () => ({ lean: async () => null }));
    t.mock.method(globalThis, 'fetch', async () => assert.fail('no due vehicles means no provider usage'));
    try { assert.deepEqual(await runMonthlyVehicleRefreshes(now), { updated: 0, failed: 0, skipped: 0, deferred: false }); }
    finally { if (previous == null) delete process.env.VINAUDIT_API_KEY; else process.env.VINAUDIT_API_KEY = previous; }
});

test('scheduler credentials and user ownership are enforced before any refresh work', async (t) => {
    const previousSecret = process.env.CRON_SECRET, previousKey = process.env.VINAUDIT_API_KEY;
    const previousState = mongoose.connection.readyState;
    process.env.CRON_SECRET = 'test-cron-secret'; process.env.VINAUDIT_API_KEY = 'monthly-test-key';
    mongoose.connection.readyState = 1;
    let claims = 0;
    t.mock.method(Valuation, 'init', async () => Valuation);
    t.mock.method(Asset, 'findOneAndUpdate', () => { claims++; return { lean: async () => null }; });
    t.mock.method(Asset, 'findOne', () => Object.assign(Promise.resolve(null), { lean: async () => null }));
    t.mock.method(Asset, 'exists', async () => null);
    const app = express(); app.use(express.json()); app.use('/cron', vehicleCronRouter);
    app.use((_req, res, next) => { res.locals.userId = 'owner-b'; next(); }); app.use(vehicleUpdatesRouter); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const call = (path: string, method = 'GET', authorization = '') => new Promise<number>((resolve, reject) => {
        const payload = method === 'PATCH' ? '{"valueTypes":["fair_market"]}' : '';
        const req = request(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
        req.on('error', reject); req.end(payload);
    });
    try {
        assert.equal(await call('/cron/vehicle-values'), 401);
        assert.equal(await call('/cron/vehicle-values', 'GET', 'Bearer wrong'), 401);
        assert.equal(claims, 0);
        assert.equal(await call('/assets/123456789012345678901234/vehicle-updates', 'PATCH'), 404);
        assert.equal(await call('/assets/123456789012345678901234/vehicle-updates/refresh', 'POST'), 404);
        assert.equal(claims, 0);
        assert.equal(await call('/cron/vehicle-values', 'GET', 'Bearer test-cron-secret'), 200);
        assert.equal(claims, 4);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve())); mongoose.connection.readyState = previousState;
        if (previousSecret == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousSecret;
        if (previousKey == null) delete process.env.VINAUDIT_API_KEY; else process.env.VINAUDIT_API_KEY = previousKey;
    }
});

test('editing mileage preserves monthly tracking and its selected trim; changing the manual amount stops that type', async (t) => {
    const previousState = mongoose.connection.readyState;
    mongoose.connection.readyState = 1;
    const doc = new Asset(vehicle());
    t.mock.method(doc, 'save', async () => doc);
    t.mock.method(Asset, 'findOne', (filter: any) => {
        assert.equal(filter.ownerId, 'owner-a');
        return Promise.resolve(doc);
    });
    t.mock.method(Valuation, 'findOne', () => ({ sort: () => ({ lean: async () => ({ amountCents: 2700000 }) }) }));
    t.mock.method(Valuation, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
    let observations = 0;
    t.mock.method(Valuation, 'create', async () => { observations++; return {}; });
    const app = express(); app.use(express.json());
    app.use((_req, res, next) => { res.locals.userId = 'owner-a'; next(); });
    app.use(assetsRouter); app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    const patch = (amountCents: number) => new Promise<number>((resolve, reject) => {
        const payload = JSON.stringify({ details: { year: 2020, mileage: 46000, trim: null }, estimate: { valueType: 'fair_market', amountCents, observedAt: '2026-10-25' } });
        const req = request(`http://127.0.0.1:${port}/assets/${doc._id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
        req.on('error', reject); req.end(payload);
    });
    try {
        assert.equal(await patch(2700000), 200);
        assert.deepEqual([...doc.vehicleValueUpdates!.valueTypes], ['fair_market', 'liquidation']);
        assert.equal(doc.vehicleValueUpdates!.trim, 'Premium Luxury');
        assert.equal(doc.vehicleValueUpdates!.leaseToken, null);
        assert.equal(doc.details.mileage, 46000);
        assert.equal(observations, 0);
        assert.equal(await patch(2800000), 200);
        assert.deepEqual([...doc.vehicleValueUpdates!.valueTypes], ['liquidation']);
        assert.equal(observations, 1);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        mongoose.connection.readyState = previousState;
    }
});
