// Live integration test. Creates one isolated temporary vehicle, calls VinAudit once,
// verifies the saved snapshot and next monthly date, then removes only that test's records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDb } from '../server/db/connect.js';
import { Asset, Valuation } from '../server/db/models.js';
import { claimVehicleRefresh, refreshClaimedVehicle, trackingSettings } from '../server/vehicles/monthly.js';
import { nextVehicleRefresh } from '../shared/vehicleUpdates.js';

for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) process.loadEnvFile(file);
const ownerId = `monthly-smoke-${randomUUID()}`;
let assetId: mongoose.Types.ObjectId | null = null;
try {
    await connectDb();
    await Promise.all([Asset.init(), Valuation.init()]);
    const now = new Date();
    const vehicle = { name: 'Temporary monthly refresh verification', category: 'vehicle' as const, currency: 'USD' as const, isSample: false, brand: 'Cadillac', model: 'XT6', condition: 'good' as const, details: { year: 2020, mileage: 45000 } };
    const created = await Asset.create({ ...vehicle, ownerId, vehicleValueUpdates: trackingSettings(vehicle, ['fair_market'], now) });
    assetId = created._id;
    const claimed = await claimVehicleRefresh(now, { assetId: String(assetId), ownerId });
    assert.ok(claimed);
    assert.equal((await refreshClaimedVehicle(claimed, now)).status, 'updated');
    const saved = await Valuation.find({ ownerId, assetId }).lean();
    const updated = await Asset.findOne({ _id: assetId, ownerId }).lean();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].source, 'provider');
    assert.equal(saved[0].method, 'Monthly vehicle value refresh');
    assert.ok(saved[0].amountCents && saved[0].amountCents > 0);
    assert.equal(updated?.vehicleValueUpdates?.nextRefreshAt?.toISOString(), nextVehicleRefresh(now).toISOString());
    assert.equal(await claimVehicleRefresh(now, { assetId: String(assetId), ownerId }), null);
    console.log(JSON.stringify({ passed: true, snapshots: saved.length, source: saved[0].sourceName, valueCents: saved[0].amountCents, nextRefreshAt: updated?.vehicleValueUpdates?.nextRefreshAt?.toISOString(), dueAgainToday: false }));
} catch (error) {
    console.error(error instanceof assert.AssertionError ? 'Monthly refresh integration assertion failed.' : 'Monthly refresh integration could not complete. Check database and provider access.');
    process.exitCode = 1;
} finally {
    if (assetId) {
        await Valuation.deleteMany({ ownerId, assetId });
        await Asset.deleteOne({ _id: assetId, ownerId });
    }
    await mongoose.disconnect();
}
