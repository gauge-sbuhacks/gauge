import { randomUUID } from 'node:crypto';
import { vehicleValueQuerySchema, type EstimateInput, type ObservedValueType, type ValuationCreateInput } from '../../shared/schemas.js';
import { nextVehicleRefresh } from '../../shared/vehicleUpdates.js';
import { vehicleValueQueryFor } from '../../shared/vehicleValue.js';
import { Asset, Valuation, type AssetDoc, type VehicleValueUpdateDoc, type WithId } from '../db/models.js';
import { HttpError } from '../errors.js';
import { lookupVehicleValue, vinauditConfigured } from '../lookups/vinaudit.js';

type VehicleAsset = Pick<AssetDoc, 'category' | 'currency' | 'isSample' | 'brand' | 'model' | 'condition' | 'details' | 'vehicleValueUpdates'>;
type ValueInput = Pick<EstimateInput | ValuationCreateInput, 'valueType' | 'source' | 'sourceName' | 'monthlyVehicleUpdates' | 'vehicleTrim'>;

export function trackingSettings(asset: VehicleAsset, valueTypes: ObservedValueType[], now: Date, trim = asset.vehicleValueUpdates?.trim ?? null): VehicleValueUpdateDoc {
    if (asset.category !== 'vehicle' || asset.currency !== 'USD' || asset.isSample) {
        throw new HttpError(400, 'unsupported', 'Monthly vehicle updates require a real vehicle recorded in USD.');
    }
    if (valueTypes.length) vehicleValueQuerySchema.parse({ ...vehicleValueQueryFor(asset), trim: trim ?? vehicleValueQueryFor(asset).trim });
    return {
        valueTypes: [...new Set(valueTypes)],
        trim,
        nextRefreshAt: valueTypes.length ? asset.vehicleValueUpdates?.nextRefreshAt ?? now : null,
        cycleAt: valueTypes.length ? asset.vehicleValueUpdates?.cycleAt ?? asset.vehicleValueUpdates?.nextRefreshAt ?? now : null,
        lastRefreshedAt: asset.vehicleValueUpdates?.lastRefreshedAt ?? null,
        lastAttemptAt: asset.vehicleValueUpdates?.lastAttemptAt ?? null,
        lastError: null,
        leaseUntil: null,
        leaseToken: null
    };
}

// A deliberate manual entry stops automatic updates for that type. Other tracked types continue.
export function settingsAfterVehicleValue(asset: VehicleAsset, input: ValueInput, now: Date): VehicleValueUpdateDoc | null {
    if (asset.category !== 'vehicle') {
        if (input.monthlyVehicleUpdates) throw new HttpError(400, 'unsupported', 'Monthly vehicle updates only apply to vehicles.');
        return null;
    }
    const types = new Set(asset.vehicleValueUpdates?.valueTypes ?? []);
    if (input.monthlyVehicleUpdates === true) {
        if (input.source !== 'provider' || !/^VinAudit (retail|trade-in)$/.test(input.sourceName ?? '')) {
            throw new HttpError(400, 'validation', 'Use a VinAudit estimate to enable monthly updates when recording a value.');
        }
        types.add(input.valueType);
        const state = trackingSettings(asset, [...types], now, input.vehicleTrim ?? null);
        return { ...state, nextRefreshAt: nextVehicleRefresh(now), cycleAt: nextVehicleRefresh(now), lastRefreshedAt: now, lastAttemptAt: now };
    }
    if (!asset.vehicleValueUpdates) return null;
    types.delete(input.valueType);
    return trackingSettings(asset, [...types], now);
}

export async function claimVehicleRefresh(now: Date, target?: { assetId: string; ownerId: string }, force = false): Promise<WithId<AssetDoc> | null> {
    return Asset.findOneAndUpdate({
        category: 'vehicle', currency: 'USD', isSample: false,
        'vehicleValueUpdates.valueTypes.0': { $exists: true },
        ...(target ? { _id: target.assetId, ownerId: target.ownerId } : {}),
        ...(!force ? { 'vehicleValueUpdates.nextRefreshAt': { $ne: null, $lte: now } } : {}),
        $or: [{ 'vehicleValueUpdates.leaseUntil': null }, { 'vehicleValueUpdates.leaseUntil': { $lte: now } }]
    }, { $set: {
        'vehicleValueUpdates.leaseToken': randomUUID(),
        'vehicleValueUpdates.leaseUntil': new Date(now.getTime() + 10 * 60_000),
        'vehicleValueUpdates.lastAttemptAt': now
    } }, { returnDocument: 'after', sort: { 'vehicleValueUpdates.nextRefreshAt': 1 } }).lean<WithId<AssetDoc>>();
}

export async function refreshClaimedVehicle(asset: WithId<AssetDoc>, now: Date, lookup = lookupVehicleValue, manual = false) {
    const state = asset.vehicleValueUpdates!;
    const guard = { _id: asset._id, ownerId: asset.ownerId, 'vehicleValueUpdates.leaseToken': state.leaseToken };
    try {
        const query = vehicleValueQueryFor(asset);
        const result = await lookup({ ...query, trim: state.trim ?? query.trim });
        // Settings, mileage or a manual valuation may have changed while the provider was running.
        const current = await Asset.findOne(guard).lean<WithId<AssetDoc>>();
        if (!current?.vehicleValueUpdates?.valueTypes.length) return { status: 'skipped' as const };
        const missing: string[] = [];
        for (const type of current.vehicleValueUpdates.valueTypes) {
            if (!state.valueTypes.includes(type)) continue;
            const price = type === 'fair_market' ? result.retail : result.tradeIn;
            if (!price) { missing.push(type); continue; }
            const kind = type === 'fair_market' ? 'retail' : 'trade-in';
            const cycle = manual ? `manual:${now.toISOString()}` : (state.cycleAt ?? state.nextRefreshAt ?? now).toISOString();
            const automaticRefreshKey = `${asset.ownerId}:${asset._id}:${type}:${cycle}`;
            await Valuation.updateOne({ automaticRefreshKey }, { $setOnInsert: {
                automaticRefreshKey, ownerId: asset.ownerId, assetId: asset._id, valueType: type,
                amountCents: price.valueCents, lowCents: price.lowCents, highCents: price.highCents,
                currency: 'USD', observedAt: now.toISOString().slice(0, 10), source: 'provider',
                sourceName: `VinAudit ${kind}`, method: manual ? 'Requested vehicle value refresh' : 'Monthly vehicle value refresh',
                conditionAssumption: asset.condition ?? null,
                notes: [`${manual ? 'Requested' : 'Monthly automatic'} ${kind} estimate.`,
                    `Used the last recorded mileage${query.mileage != null ? ` of ${query.mileage.toLocaleString('en-US')} miles` : ' (provider average)'}.`, ...result.notes].join(' ').slice(0, 1000)
            } }, { upsert: true });
        }
        if (missing.length) throw new HttpError(404, 'no_data', `VinAudit had no ${missing.map((x) => x === 'fair_market' ? 'retail' : 'trade-in').join(' or ')} value. Saved values were kept; another attempt is scheduled tomorrow.`);
        await Asset.updateOne(guard, { $set: {
            'vehicleValueUpdates.nextRefreshAt': nextVehicleRefresh(now),
            'vehicleValueUpdates.cycleAt': nextVehicleRefresh(now),
            'vehicleValueUpdates.lastRefreshedAt': now,
            'vehicleValueUpdates.lastError': null,
            'vehicleValueUpdates.leaseUntil': null,
            'vehicleValueUpdates.leaseToken': null
        } });
        return { status: 'updated' as const };
    } catch (error) {
        // Store only our sanitized provider messages, never upstream URLs, keys or stack traces.
        const message = error instanceof HttpError ? error.message : 'The monthly refresh could not complete. Saved values were kept; another attempt is scheduled tomorrow.';
        await Asset.updateOne(guard, { $set: {
            'vehicleValueUpdates.nextRefreshAt': new Date(now.getTime() + 24 * 60 * 60_000),
            'vehicleValueUpdates.lastError': message,
            'vehicleValueUpdates.leaseUntil': null,
            'vehicleValueUpdates.leaseToken': null
        } });
        return { status: 'failed' as const, code: error instanceof HttpError ? error.code : 'refresh_failed' };
    }
}

export async function runMonthlyVehicleRefreshes(now = new Date()) {
    if (!vinauditConfigured()) throw new HttpError(503, 'not_configured', 'Monthly vehicle updates need VINAUDIT_API_KEY.');
    // Ensure the durable idempotency index exists before any automatic observations are written.
    await Valuation.init();
    const stats = { updated: 0, failed: 0, skipped: 0, deferred: false };
    const deadline = Date.now() + 240_000;
    for (let batch = 0; batch < 250 && Date.now() < deadline; batch++) {
        const claims = await Promise.all(Array.from({ length: 4 }, () => claimVehicleRefresh(now)));
        const assets = claims.filter((asset): asset is WithId<AssetDoc> => asset != null);
        if (!assets.length) return stats;
        const outcomes = await Promise.all(assets.map((asset) => refreshClaimedVehicle(asset, now)));
        for (const outcome of outcomes) stats[outcome.status]++;
        // An account-level failure should not consume more requests for every remaining vehicle.
        if (outcomes.some((x) => x.status === 'failed' && ['provider_auth', 'provider_quota'].includes(x.code))) return { ...stats, deferred: true };
    }
    return { ...stats, deferred: true };
}

