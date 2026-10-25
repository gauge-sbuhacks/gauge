// "test data" button: load or remove the sample portfolio for the signed-in user.
// sample assets are flagged isSample, so removing them never touches anything you entered yourself.

import { Router } from 'express';
import { buildSamplePortfolio } from '../../shared/sampleData.js';
import { ownerIdOf } from '../auth.js';
import { withDb } from '../db/connect.js';
import { Asset, Valuation } from '../db/models.js';
import { ResearchSnapshot } from '../history/models.js';
import { MarketReport } from './marketplace.js';
import { cleanDetails } from './assets.js';

export const sampleRouter = Router();
sampleRouter.use(withDb);

async function removeSample(ownerId: string): Promise<number> {
    const ids = await Asset.find({ ownerId, isSample: true }).distinct('_id');
    if (ids.length === 0) return 0;
    await Valuation.deleteMany({ ownerId, assetId: { $in: ids } });
    await MarketReport.deleteMany({ ownerId, assetId: { $in: ids.map(String) } });
    await ResearchSnapshot.deleteMany({ ownerId, assetId: { $in: ids.map(String) } });
    const result = await Asset.deleteMany({ ownerId, isSample: true });
    return result.deletedCount;
}

// load (or reload) the test portfolio. reloading replaces the old test items instead of duplicating them
sampleRouter.post('/sample', async (_req, res) => {
    const ownerId = ownerIdOf(res);
    await removeSample(ownerId);

    const items = buildSamplePortfolio(new Date());
    const now = Date.now();
    const assets = await Asset.insertMany(
        items.map((item, i) => ({
            ...item.asset,
            details: cleanDetails(item.asset.category, item.asset.details),
            ownerId,
            isSample: true,
            // stagger timestamps so "recently updated" has a stable order
            createdAt: new Date(now - (items.length - i) * 60_000),
            updatedAt: new Date(now - (items.length - i) * 60_000)
        }))
    );

    const valuations = items.flatMap((item, i) =>
        item.valuations.map((v) => ({
            ...v,
            ownerId,
            assetId: assets[i]._id,
            currency: 'USD'
        }))
    );
    if (valuations.length > 0) await Valuation.insertMany(valuations);

    res.status(201).json({ added: assets.length, valuations: valuations.length });
});

sampleRouter.delete('/sample', async (_req, res) => {
    const removed = await removeSample(ownerIdOf(res));
    res.json({ removed });
});
