// asset + valuation routes. the rule for every query here: filter by ownerId, never by id alone,
// so one user can never read or change another user's things (a wrong owner just looks like "not found").

import { Router } from 'express';
import type { z } from 'zod';
import { detailsSchemaFor, getCategory, isCategoryId, type CategoryId, type Details } from '../../shared/categories.js';
import {
    assetCreateSchema,
    assetPatchSchema,
    valuationCreateSchema,
    type AssetResponse,
    type EstimateInput,
    type PortfolioResponse
} from '../../shared/schemas.js';
import { ownerIdOf } from '../auth.js';
import { withDb } from '../db/connect.js';
import { Asset, Valuation, toAssetRecord, toValuationRecord, type AssetDoc, type ValuationDoc, type WithId } from '../db/models.js';
import { HttpError, notFound, zodFieldErrors } from '../errors.js';

export const assetsRouter = Router();
assetsRouter.use(withDb);

// ---------- helpers ----------

const SIMPLE_FIELDS = [
    'name',
    'category',
    'brand',
    'model',
    'location',
    'condition',
    'purchaseDate',
    'purchasePriceCents',
    'currency',
    'serialNumber',
    'insurance',
    'insuranceNote',
    'notes'
] as const;

// mongo ids are 24 hex characters. anything else can't be one of ours, so it's a 404 (not a crash)
function checkId(id: string, what: string) {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw notFound(what);
}

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

export function cleanDetails(category: CategoryId, raw: unknown): Details {
    const result = detailsSchemaFor(category).safeParse(raw ?? {});
    if (!result.success) {
        throw new HttpError(400, 'validation', 'Some fields need attention.', zodFieldErrors(result.error, 'details.'));
    }
    return result.data;
}

// validate the main fields and the category details together, so the form gets every error in one go
function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown, categoryOf: (data: unknown) => CategoryId | null): T {
    const main = schema.safeParse(body);
    const raw = (body ?? {}) as { details?: unknown };
    const category = categoryOf(main.success ? main.data : body);
    const details = category && raw.details !== undefined ? detailsSchemaFor(category).safeParse(raw.details) : null;

    const fieldErrors = {
        ...(main.success ? {} : zodFieldErrors(main.error)),
        ...(details && !details.success ? zodFieldErrors(details.error, 'details.') : {})
    };
    if (!main.success || (details && !details.success)) {
        throw new HttpError(400, 'validation', 'Some fields need attention.', fieldErrors);
    }
    return main.data;
}

const categoryFromBody = (data: unknown): CategoryId | null => {
    const c = (data as { category?: unknown })?.category;
    return typeof c === 'string' && isCategoryId(c) ? c : null;
};

// when the category changes, keep whatever old details still make sense for the new one (like "year")
function carryOverDetails(category: CategoryId, old: Details): Details {
    const kept: Details = {};
    const schema = detailsSchemaFor(category);
    for (const field of getCategory(category).fields) {
        if (!(field.key in old)) continue;
        const one = schema.safeParse({ [field.key]: old[field.key] });
        if (one.success && field.key in one.data) kept[field.key] = one.data[field.key];
    }
    return kept;
}

async function addEstimate(ownerId: string, assetId: WithId<AssetDoc>['_id'], estimate: EstimateInput, onlyIfChanged: boolean) {
    if (onlyIfChanged) {
        const latest = await Valuation.findOne({ ownerId, assetId, valueType: estimate.valueType })
            .sort({ observedAt: -1, createdAt: -1 })
            .lean<WithId<ValuationDoc>>();
        if (latest && latest.amountCents === estimate.amountCents) return;
    }
    await Valuation.create({
        ownerId,
        assetId,
        valueType: estimate.valueType,
        amountCents: estimate.amountCents,
        observedAt: estimate.observedAt ?? todayUtc(),
        source: 'user'
    });
}

async function assetResponse(ownerId: string, doc: WithId<AssetDoc>): Promise<AssetResponse> {
    const valuations = await Valuation.find({ ownerId, assetId: doc._id })
        .sort({ observedAt: 1, createdAt: 1 })
        .lean<WithId<ValuationDoc>[]>();
    return { asset: toAssetRecord(doc), valuations: valuations.map(toValuationRecord) };
}

// ---------- the whole portfolio (assets + every observation) ----------

assetsRouter.get('/assets', async (_req, res) => {
    const ownerId = ownerIdOf(res);
    const [assets, valuations] = await Promise.all([
        Asset.find({ ownerId }).sort({ updatedAt: -1 }).lean<WithId<AssetDoc>[]>(),
        Valuation.find({ ownerId }).sort({ observedAt: 1, createdAt: 1 }).lean<WithId<ValuationDoc>[]>()
    ]);
    const body: PortfolioResponse = { assets: assets.map(toAssetRecord), valuations: valuations.map(toValuationRecord) };
    res.json(body);
});

// ---------- one asset ----------

assetsRouter.get('/assets/:id', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');
    const doc = await Asset.findOne({ _id: req.params.id, ownerId }).lean<WithId<AssetDoc>>();
    if (!doc) throw notFound('That asset');
    res.json(await assetResponse(ownerId, doc));
});

assetsRouter.post('/assets', async (req, res) => {
    const ownerId = ownerIdOf(res);
    const input = parseOrThrow(assetCreateSchema, req.body, categoryFromBody);
    const details = cleanDetails(input.category, input.details);

    const created = await Asset.create({
        ownerId,
        name: input.name,
        category: input.category,
        brand: input.brand ?? null,
        model: input.model ?? null,
        location: input.location ?? null,
        condition: input.condition ?? null,
        purchaseDate: input.purchaseDate ?? null,
        purchasePriceCents: input.purchasePriceCents ?? null,
        currency: input.currency ?? 'USD',
        serialNumber: input.serialNumber ?? null,
        insurance: input.insurance ?? null,
        insuranceNote: input.insuranceNote ?? null,
        notes: input.notes ?? null,
        details,
        isSample: false
    });
    if (input.estimate) await addEstimate(ownerId, created._id, input.estimate, false);

    res.status(201).json(await assetResponse(ownerId, created.toObject() as WithId<AssetDoc>));
});

assetsRouter.patch('/assets/:id', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');

    const doc = await Asset.findOne({ _id: req.params.id, ownerId });
    if (!doc) throw notFound('That asset');
    // details are checked against the new category if it's changing, otherwise the current one
    const input = parseOrThrow(assetPatchSchema, req.body, (data) => categoryFromBody(data) ?? doc.category);

    const previousCategory = doc.category;
    const nextCategory = input.category ?? previousCategory;

    for (const key of SIMPLE_FIELDS) {
        const value = input[key];
        if (value !== undefined) doc.set(key, value);
    }

    if (input.details !== undefined) {
        doc.set('details', cleanDetails(nextCategory, input.details));
    } else if (nextCategory !== previousCategory) {
        doc.set('details', carryOverDetails(nextCategory, doc.details ?? {}));
    }
    doc.markModified('details');
    await doc.save();

    // a changed estimate becomes a new dated observation, so history is kept instead of overwritten
    if (input.estimate) await addEstimate(ownerId, doc._id, input.estimate, true);

    res.json(await assetResponse(ownerId, doc.toObject() as WithId<AssetDoc>));
});

assetsRouter.delete('/assets/:id', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');
    const result = await Asset.deleteOne({ _id: req.params.id, ownerId });
    if (result.deletedCount === 0) throw notFound('That asset');
    await Valuation.deleteMany({ ownerId, assetId: req.params.id });
    res.status(204).end();
});

// ---------- valuation observations ----------

assetsRouter.post('/assets/:id/valuations', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');
    const input = valuationCreateSchema.parse(req.body);

    const owned = await Asset.exists({ _id: req.params.id, ownerId });
    if (!owned) throw notFound('That asset');

    const created = await Valuation.create({
        ownerId,
        assetId: req.params.id,
        valueType: input.valueType,
        amountCents: input.amountCents ?? null,
        lowCents: input.lowCents ?? null,
        highCents: input.highCents ?? null,
        currency: input.currency ?? 'USD',
        observedAt: input.observedAt,
        source: input.source ?? 'user',
        sourceName: input.sourceName ?? null,
        method: input.method ?? null,
        conditionAssumption: input.conditionAssumption ?? null,
        notes: input.notes ?? null
    });
    // touch the asset so "recently updated" sorting notices the new value
    await Asset.updateOne({ _id: req.params.id, ownerId }, { $set: { updatedAt: new Date() } });

    res.status(201).json({ valuation: toValuationRecord(created.toObject() as WithId<ValuationDoc>) });
});

assetsRouter.delete('/assets/:id/valuations/:valuationId', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');
    checkId(req.params.valuationId, 'That valuation');
    const result = await Valuation.deleteOne({ _id: req.params.valuationId, assetId: req.params.id, ownerId });
    if (result.deletedCount === 0) throw notFound('That valuation');
    res.status(204).end();
});
