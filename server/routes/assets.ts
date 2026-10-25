// asset + valuation routes. the rule for every query here: filter by ownerId, never by id alone,
// so one user can never read or change another user's things (a wrong owner just looks like "not found").

import { ResearchSnapshot } from '../history/models.js';
import { MarketReport } from './marketplace.js';
import { Router } from 'express';
import type { z } from 'zod';
import { detailsSchemaFor, getCategory, isCategoryId, type CategoryId, type Details } from '../../shared/categories.js';
import {
    OBSERVED_VALUE_TYPES,
    PRICE_CHECK_SOURCE,
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
import { suggestValuesForAsset } from '../capture/suggest.js';
import { settingsAfterVehicleValue } from '../vehicles/monthly.js';
import { vehicleValueQueryFor } from '../../shared/vehicleValue.js';

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function estimateFromSuggestedPart(
    valueType: EstimateInput['valueType'],
    part: { amountCents: number; sourceName: string; notes: string }
): EstimateInput {
    const fromProvider = part.sourceName !== PRICE_CHECK_SOURCE;
    return {
        valueType,
        amountCents: part.amountCents,
        observedAt: todayUtc(),
        source: 'provider',
        sourceName: part.sourceName,
        method: fromProvider ? part.sourceName : PRICE_CHECK_SOURCE,
        notes: part.notes,
        vehicleTrim: null
    };
}

async function estimatesFromSuggestion(input: {
    category: CategoryId;
    name: string;
    brand?: string | null;
    model?: string | null;
    condition?: EstimateInput['conditionAssumption'];
    details: Details;
}): Promise<{ fair: EstimateInput | null; liquidation: EstimateInput | null }> {
    const suggested = await suggestValuesForAsset(input);
    return {
        fair: suggested.fairMarket ? estimateFromSuggestedPart('fair_market', suggested.fairMarket) : null,
        liquidation: suggested.quickSale ? estimateFromSuggestedPart('liquidation', suggested.quickSale) : null
    };
}

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
    'notes'
] as const;

// mongo ids are 24 hex characters. anything else can't be one of ours, so it's a 404 (not a crash)
function checkId(id: string, what: string) {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw notFound(what);
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
        source: estimate.source ?? 'user',
        sourceName: estimate.sourceName ?? null,
        method: estimate.method ?? null,
        conditionAssumption: estimate.conditionAssumption ?? null,
        notes: estimate.notes ?? null
    });
}

async function assetResponse(ownerId: string, doc: WithId<AssetDoc>): Promise<AssetResponse> {
    const valuations = await Valuation.find({ ownerId, assetId: doc._id, valueType: { $in: OBSERVED_VALUE_TYPES } })
        .sort({ observedAt: 1, createdAt: 1 })
        .lean<WithId<ValuationDoc>[]>();
    return { asset: toAssetRecord(doc), valuations: valuations.map(toValuationRecord) };
}

// ---------- the whole portfolio (assets + every observation) ----------

assetsRouter.get('/assets', async (_req, res) => {
    const ownerId = ownerIdOf(res);
    const [assets, valuations] = await Promise.all([
        Asset.find({ ownerId }).sort({ updatedAt: -1 }).lean<WithId<AssetDoc>[]>(),
        Valuation.find({ ownerId, valueType: { $in: OBSERVED_VALUE_TYPES } }).sort({ observedAt: 1, createdAt: 1 }).lean<WithId<ValuationDoc>[]>()
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
    let estimate = input.estimate ?? null;
    let liquidation = input.liquidationEstimate ?? null;
    if (input.category !== 'property' && (!estimate || !liquidation)) {
        const suggested = await estimatesFromSuggestion({
            category: input.category,
            name: input.name,
            brand: input.brand,
            model: input.model,
            condition: input.condition,
            details
        });
        if (!estimate) estimate = suggested.fair;
        if (!liquidation) liquidation = suggested.liquidation;
    }
    const isSample = input.isSample === true;
    // test data never refreshes on its own
    if (isSample) {
        if (estimate) estimate = { ...estimate, monthlyVehicleUpdates: false };
        if (liquidation) liquidation = { ...liquidation, monthlyVehicleUpdates: false };
    }
    // a VinAudit retail (fair market) and trade-in (quick-sale) can both turn on monthly updates
    const vehicle = {
        category: input.category, currency: input.currency ?? 'USD', isSample,
        brand: input.brand ?? null, model: input.model ?? null, condition: input.condition ?? null, details
    };
    const now = new Date();
    let tracking: ReturnType<typeof settingsAfterVehicleValue> = null;
    for (const value of [estimate, liquidation]) {
        if (value) tracking = settingsAfterVehicleValue({ ...vehicle, vehicleValueUpdates: tracking }, value, now);
    }

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
        notes: input.notes ?? null,
        details,
        isSample,
        vehicleValueUpdates: tracking
    });
    if (estimate) await addEstimate(ownerId, created._id, estimate, false);
    if (liquidation) await addEstimate(ownerId, created._id, liquidation, false);

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
    const previousVehicle = vehicleValueQueryFor(doc);

    for (const key of SIMPLE_FIELDS) {
        const value = input[key];
        if (value !== undefined) doc.set(key, value);
    }

    if (input.details !== undefined) {
        doc.set('details', cleanDetails(nextCategory, input.details));
    } else if (nextCategory !== previousCategory) {
        doc.set('details', carryOverDetails(nextCategory, doc.details ?? {}));
    }
    if (nextCategory !== 'vehicle') doc.set('vehicleValueUpdates', null);
    else if (doc.vehicleValueUpdates && (input.details !== undefined || input.brand !== undefined || input.model !== undefined || input.condition !== undefined)) {
        // Invalidate a running lookup when the vehicle changes; use the edited trim thereafter.
        doc.set('vehicleValueUpdates.leaseToken', null);
        doc.set('vehicleValueUpdates.leaseUntil', null);
        const nextVehicle = vehicleValueQueryFor(doc);
        if (['vin', 'year', 'make', 'model', 'trim'].some((key) => previousVehicle[key as keyof typeof previousVehicle] !== nextVehicle[key as keyof typeof nextVehicle])) doc.set('vehicleValueUpdates.trim', null);
    }
    if (input.estimate) {
        // The edit form submits its existing amount even for a mileage/name-only edit.
        // Preserve its schedule unless the amount changed or the user explicitly changed tracking.
        const latest = await Valuation.findOne({ ownerId, assetId: doc._id, valueType: input.estimate.valueType }).sort({ observedAt: -1, createdAt: -1 }).lean<WithId<ValuationDoc>>();
        if (input.estimate.monthlyVehicleUpdates !== undefined || latest?.amountCents !== input.estimate.amountCents) {
            doc.set('vehicleValueUpdates', settingsAfterVehicleValue(doc, input.estimate, new Date()));
        }
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
    await MarketReport.deleteMany({ ownerId, assetId: req.params.id });
    await ResearchSnapshot.deleteMany({ ownerId, assetId:req.params.id });
    res.status(204).end();
});

// ---------- valuation observations ----------

assetsRouter.post('/assets/:id/valuations', async (req, res) => {
    const ownerId = ownerIdOf(res);
    checkId(req.params.id, 'That asset');
    const input = valuationCreateSchema.parse(req.body);

    const owned = await Asset.findOne({ _id: req.params.id, ownerId }).lean<WithId<AssetDoc>>();
    if (!owned) throw notFound('That asset');
    if (input.monthlyVehicleUpdates && input.currency && input.currency !== owned.currency) throw new HttpError(400, 'validation', 'Monthly updates must use the vehicle currency.');
    const tracking = settingsAfterVehicleValue(owned, input, new Date());

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
    await Asset.updateOne({ _id: req.params.id, ownerId }, { $set: { updatedAt: new Date(), ...(owned.category === 'vehicle' ? { vehicleValueUpdates: tracking } : {}) } });

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
