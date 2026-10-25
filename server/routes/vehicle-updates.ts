import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { OBSERVED_VALUE_TYPES } from '../../shared/schemas.js';
import { ownerIdOf } from '../auth.js';
import { connectDb, withDb } from '../db/connect.js';
import { Asset, Valuation, toAssetRecord, type AssetDoc, type WithId } from '../db/models.js';
import { getEnv } from '../env.js';
import { HttpError, notFound } from '../errors.js';
import { makeRateLimiter } from '../lookups/cache.js';
import { claimVehicleRefresh, refreshClaimedVehicle, runMonthlyVehicleRefreshes, trackingSettings } from '../vehicles/monthly.js';

export const vehicleUpdatesRouter = Router();
vehicleUpdatesRouter.use(withDb);
const body = z.object({ valueTypes: z.array(z.enum(OBSERVED_VALUE_TYPES)).max(2) });
const allowRefresh = makeRateLimiter(1, 60_000);

vehicleUpdatesRouter.patch('/assets/:id/vehicle-updates', async (req, res) => {
    const ownerId = ownerIdOf(res);
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id))) throw notFound('That vehicle');
    const input = body.parse(req.body);
    const asset = await Asset.findOne({ _id: req.params.id, ownerId });
    if (!asset) throw notFound('That vehicle');
    asset.set('vehicleValueUpdates', trackingSettings(asset, input.valueTypes, new Date()));
    await asset.save();
    res.json({ asset: toAssetRecord(asset.toObject() as WithId<AssetDoc>) });
});

vehicleUpdatesRouter.post('/assets/:id/vehicle-updates/refresh', async (req, res) => {
    const ownerId = ownerIdOf(res);
    const assetId = String(req.params.id);
    if (!/^[a-f0-9]{24}$/i.test(assetId)) throw notFound('That vehicle');
    const owned = await Asset.exists({ _id: assetId, ownerId });
    if (!owned) throw notFound('That vehicle');
    if (!allowRefresh(`${ownerId}:${assetId}`)) throw new HttpError(429, 'rate_limited', 'Wait a minute before refreshing this vehicle again.');
    await Valuation.init();
    const now = new Date();
    const asset = await claimVehicleRefresh(now, { assetId, ownerId }, true);
    if (!asset) throw new HttpError(409, 'not_tracking', 'Enable monthly updates first, or wait for the current refresh to finish.');
    const result = await refreshClaimedVehicle(asset, now, undefined, true);
    if (result.status === 'failed') return res.status(502).json({ error: result.code, message: 'The estimate could not refresh. Your saved value was kept. Check the monthly updates status for details.' });
    if (result.status === 'skipped') throw new HttpError(409, 'changed', 'The vehicle changed during the refresh. Try again with the current details.');
    res.json(result);
});

// Scheduler credentials are independent of user sessions and checked before connecting to MongoDB.
export const vehicleCronRouter = Router();
vehicleCronRouter.get('/vehicle-values', async (req, res) => {
    const secret = getEnv().cronSecret;
    if (!secret) throw new HttpError(503, 'not_configured', 'The vehicle refresh scheduler is not configured.');
    const actual = Buffer.from(req.header('authorization') ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new HttpError(401, 'unauthorized', 'Scheduler authorization required.');
    await connectDb();
    res.json(await runMonthlyVehicleRefreshes());
});
