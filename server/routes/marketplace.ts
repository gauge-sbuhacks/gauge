import mongoose, { Schema } from 'mongoose';
import { Router } from 'express';
import type { MarketResearch } from '../../shared/marketplace.js';
import { ownerIdOf } from '../auth.js';
import { withDb } from '../db/connect.js';
import { Asset, Profile, toAssetRecord, type AssetDoc, type ProfileDoc, type WithId } from '../db/models.js';
import { HttpError, notFound } from '../errors.js';
import { makeRateLimiter } from '../lookups/cache.js';
import { researchAsset } from '../marketplace/research.js';

interface ResearchDoc { ownerId: string; assetId: string; report: MarketResearch; assetUpdatedAt: string; }
const schema = new Schema<ResearchDoc>({ ownerId: { type: String, required: true }, assetId: { type: String, required: true }, report: { type: Schema.Types.Mixed, required: true }, assetUpdatedAt: String }, { timestamps: true });
schema.index({ ownerId: 1, assetId: 1 }, { unique: true });
export const MarketReport = (mongoose.models.MarketReport as mongoose.Model<ResearchDoc>) ?? mongoose.model<ResearchDoc>('MarketReport',schema);
export const marketplaceRouter = Router();
marketplaceRouter.use(withDb);
const allow = makeRateLimiter(5,60_000);
const assetVersion = (a: AssetDoc) => JSON.stringify([a.name,a.category,a.brand,a.model,a.condition,a.currency,a.details]);

marketplaceRouter.get('/assets/:id/market-research', async (req,res) => {
    const ownerId = ownerIdOf(res);
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw notFound('That asset');
    const asset = await Asset.findOne({ _id: req.params.id, ownerId }).lean<WithId<AssetDoc>>();
    if (!asset) throw notFound('That asset');
    const [saved, profile] = await Promise.all([
        MarketReport.findOne({ ownerId, assetId: req.params.id }).lean<ResearchDoc>(),
        Profile.findOne({ ownerId }).lean<ProfileDoc>()
    ]);
    const location = profile?.marketLocation ?? null;
    const current = saved && saved.assetUpdatedAt === assetVersion(asset) && JSON.stringify(saved.report.location) === JSON.stringify(location);
    res.json({ report: current ? saved.report : null });
});

marketplaceRouter.post('/assets/:id/market-research', async (req,res) => {
    const ownerId = ownerIdOf(res);
    if (!allow(ownerId)) throw new HttpError(429,'rate_limited','Wait a minute before researching more items.');
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw notFound('That asset');
    const [asset,profile] = await Promise.all([
        Asset.findOne({ _id: req.params.id, ownerId }).lean<WithId<AssetDoc>>(),
        Profile.findOne({ ownerId }).lean<ProfileDoc>()
    ]);
    if (!asset) throw notFound('That asset');
    const report = await researchAsset(toAssetRecord(asset),profile?.marketLocation ?? null);
    await MarketReport.findOneAndUpdate({ ownerId, assetId: req.params.id }, { $set: { report, assetUpdatedAt: assetVersion(asset) } }, { upsert: true, runValidators: true });
    res.json({ report });
});
