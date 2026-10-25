import { randomUUID } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';
import { Router } from 'express';
import { getCategory, isCategoryId, type CategoryId, type Details } from '../../shared/categories.js';
import {
    MAX_CAPTURE_PHOTOS,
    MAX_PHOTO_BYTES,
    PHOTO_KINDS,
    REVIEW_MANUAL_SOURCE,
    captureStatus,
    captureTtlMs,
    type AssetPhoto,
    type CaptureApproval,
    type CaptureDraft,
    type CaptureMode,
    type CaptureSessionView,
    type IdentifiedItem,
    type PhoneCaptureView,
    type PhotoKind,
    type ReviewedSource
} from '../../shared/capture.js';
import { CONDITIONS } from '../../shared/schemas.js';
import { ownerIdOf } from '../auth.js';
import { enrichIdentification } from '../capture/pipeline.js';
import { geminiConfigured, identifyPhotos } from '../capture/identify.js';
import { readCapturePhoto, saveCapturePhoto } from '../capture/store.js';
import { hashCaptureToken, newCaptureToken, validTokenShape } from '../capture/token.js';
import { withDb } from '../db/connect.js';
import { Asset, Valuation, type AssetDoc, type WithId } from '../db/models.js';
import { cleanDetails } from './assets.js';
import { HttpError, notFound } from '../errors.js';
import { makeRateLimiter } from '../lookups/cache.js';

interface SessionDoc {
    ownerId: string;
    tokenHash: string;
    mode: CaptureMode;
    assetId: string | null;
    expiresAt: Date;
    claimedAt: Date | null;
    clientHash: string | null;
    revokedAt: Date | null;
    drafts: CaptureDraft[];
}

const sessionSchema = new Schema<SessionDoc>(
    {
        ownerId: { type: String, required: true },
        tokenHash: { type: String, required: true, unique: true },
        mode: { type: String, enum: ['once', 'catalog'], required: true },
        assetId: { type: String, default: null },
        expiresAt: { type: Date, required: true },
        claimedAt: { type: Date, default: null },
        clientHash: { type: String, default: null },
        revokedAt: { type: Date, default: null },
        drafts: { type: Schema.Types.Mixed, default: [] }
    },
    { timestamps: true }
);
sessionSchema.index({ ownerId: 1, expiresAt: -1 });

export const CaptureSession =
    (mongoose.models.CaptureSession as mongoose.Model<SessionDoc>) ?? mongoose.model<SessionDoc>('CaptureSession', sessionSchema);

const allowUpload = makeRateLimiter(30, 60_000);

function viewOf(doc: WithId<SessionDoc>, token?: string): CaptureSessionView {
    return {
        id: String(doc._id),
        mode: doc.mode,
        expiresAt: doc.expiresAt.toISOString(),
        status: captureStatus({ revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null, expiresAt: doc.expiresAt.toISOString() }),
        assetId: doc.assetId,
        claimed: doc.claimedAt != null,
        drafts: doc.drafts ?? [],
        ...(token ? { token } : {})
    };
}

function phoneView(doc: WithId<SessionDoc>): PhoneCaptureView {
    const status = captureStatus({ revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null, expiresAt: doc.expiresAt.toISOString() });
    return {
        status,
        mode: doc.mode,
        expiresAt: doc.expiresAt.toISOString(),
        photoCount: photoCount(doc),
        maxPhotos: MAX_CAPTURE_PHOTOS,
        storageReady: true
    };
}

async function openSession(token: string) {
    if (!validTokenShape(token)) throw notFound('That capture link');
    const doc = await CaptureSession.findOne({ tokenHash: hashCaptureToken(token) });
    if (!doc) throw notFound('That capture link');
    return doc;
}

function assertOpen(doc: { revokedAt: Date | null; expiresAt: Date }) {
    const status = captureStatus({ revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null, expiresAt: doc.expiresAt.toISOString() });
    if (status !== 'open') throw new HttpError(410, 'capture_closed', status === 'revoked' ? 'This capture link was revoked.' : 'This capture link expired.');
}

function photoCount(doc: SessionDoc): number {
    const seen = new Set<string>();
    for (const draft of doc.drafts ?? []) for (const photo of draft.photos) seen.add(photo.photoId);
    return seen.size;
}

function decodeImage(data: string, mime: string): { bytes: Buffer; mime: 'image/jpeg' | 'image/webp' } {
    if (mime !== 'image/jpeg' && mime !== 'image/webp') throw new HttpError(400, 'validation', 'Send a JPEG or WebP photo.');
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length < 32 || bytes.length > MAX_PHOTO_BYTES) throw new HttpError(400, 'validation', 'That photo is empty or over 4 MB.');
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (mime === 'image/jpeg' && !jpeg) throw new HttpError(400, 'validation', 'That file is not a JPEG.');
    if (mime === 'image/webp' && !webp) throw new HttpError(400, 'validation', 'That file is not a WebP.');
    return { bytes, mime };
}

function blankDraft(groupId: string, photo: AssetPhoto): CaptureDraft {
    return {
        id: randomUUID(),
        groupId,
        status: 'identifying',
        photos: [photo],
        category: null,
        name: null,
        brand: null,
        model: null,
        serialNumber: null,
        condition: null,
        details: {},
        confidence: null,
        notes: null,
        lookupStatus: 'pending',
        lookupMessage: null,
        suggestedValue: null,
        quickSale: null,
        purchasePriceCents: null,
        assetId: null
    };
}

async function imagePayload(ownerId: string, photo: AssetPhoto, fresh?: { mime: string; base64: string }): Promise<{ mime: string; base64: string } | null> {
    if (fresh) return fresh;
    const stored = await readCapturePhoto(ownerId, photo.photoId);
    if (!stored) return null;
    return { mime: stored.contentType, base64: stored.data.toString('base64') };
}

async function fillDraft(draft: CaptureDraft, images: { mime: string; base64: string }[], multi: boolean) {
    let items: IdentifiedItem[] = [];
    try {
        items = geminiConfigured() ? await identifyPhotos(images, multi) : [];
    } catch (err) {
        draft.status = 'ready';
        draft.lookupStatus = 'error';
        draft.lookupMessage = err instanceof Error ? err.message : 'Identification failed.';
        draft.name = draft.name || 'Untitled item';
        return;
    }
    const first = items[0];
    if (!first) {
        draft.status = 'ready';
        draft.lookupStatus = 'skipped';
        draft.lookupMessage = geminiConfigured() ? 'Could not identify this photo.' : 'Photo identification needs a Gemini key (GEMINI_API_KEY).';
        draft.name = draft.name || 'Untitled item';
        return;
    }
    const enriched = await enrichIdentification(first);
    Object.assign(draft, {
        status: 'ready' as const,
        category: enriched.category,
        name: enriched.name || 'Untitled item',
        brand: enriched.brand,
        model: enriched.model,
        serialNumber: enriched.serialNumber,
        condition: enriched.condition,
        details: enriched.details,
        confidence: first.confidence,
        notes: first.notes,
        lookupStatus: enriched.lookupStatus,
        lookupMessage: enriched.lookupMessage,
        suggestedValue: enriched.suggestedValue,
        quickSale: enriched.quickSale
    });
}

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

export const capturePublicRouter = Router();
capturePublicRouter.use(withDb);

capturePublicRouter.get('/capture/:token', async (req, res) => {
    const doc = await openSession(req.params.token);
    res.json(phoneView(doc));
});

capturePublicRouter.post('/capture/:token/photos', async (req, res) => {
    const doc = await openSession(req.params.token);
    const ownerId = doc.ownerId;
    assertOpen(doc);
    if (!allowUpload(doc.tokenHash)) throw new HttpError(429, 'rate_limited', 'Wait a minute before sending more photos.');
    if (photoCount(doc) >= MAX_CAPTURE_PHOTOS) throw new HttpError(400, 'validation', `This session already has ${MAX_CAPTURE_PHOTOS} photos.`);

    const body = (req.body ?? {}) as { groupId?: unknown; kind?: unknown; mime?: unknown; data?: unknown };
    const groupId = typeof body.groupId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(body.groupId) ? body.groupId : null;
    const kind = PHOTO_KINDS.includes(body.kind as PhotoKind) ? (body.kind as PhotoKind) : null;
    if (!groupId || !kind || typeof body.mime !== 'string' || typeof body.data !== 'string') {
        throw new HttpError(400, 'validation', 'Send a photo with its slot and group.');
    }
    const image = decodeImage(body.data, body.mime);
    const saved = await saveCapturePhoto(ownerId, image.bytes, image.mime);
    const photo: AssetPhoto = { photoId: saved.photoId, kind, capturedAt: new Date().toISOString() };

    if (kind === 'scene') {
        const draft = blankDraft(groupId, photo);
        doc.drafts.push(draft);
        await applySceneSplit(draft, doc, [{ mime: image.mime, base64: image.bytes.toString('base64') }]);
        doc.markModified('drafts');
        await doc.save();
        res.status(201).json({ received: true, draftId: draft.id });
        return;
    }

    let draft = doc.drafts.find((d) => d.groupId === groupId && d.status !== 'confirmed' && d.status !== 'discarded');
    if (!draft) {
        draft = blankDraft(groupId, photo);
        doc.drafts.push(draft);
    } else {
        draft.photos = draft.photos.filter((p) => p.kind !== kind).concat(photo);
        draft.status = 'identifying';
    }
    doc.markModified('drafts');
    await doc.save();

    const images = [];
    for (const existing of draft.photos) {
        const payload = await imagePayload(ownerId, existing, existing.photoId === photo.photoId ? { mime: image.mime, base64: image.bytes.toString('base64') } : undefined);
        if (payload) images.push(payload);
    }
    await fillDraft(draft, images, false);
    doc.markModified('drafts');
    await doc.save();
    res.status(201).json({ received: true, draftId: draft.id });
});

export const captureRouter = Router();
captureRouter.use(withDb);

captureRouter.get('/photos/:id', async (req, res) => {
    const photo = await readCapturePhoto(ownerIdOf(res), req.params.id);
    if (!photo) throw notFound('That photo');
    res.set('Content-Type', photo.contentType);
    res.send(photo.data);
});

async function applySceneSplit(primary: CaptureDraft, doc: WithId<SessionDoc>, images: { mime: string; base64: string }[]) {
    let items: IdentifiedItem[] = [];
    try {
        items = geminiConfigured() ? await identifyPhotos(images, true) : [];
    } catch (err) {
        primary.status = 'ready';
        primary.lookupStatus = 'error';
        primary.lookupMessage = err instanceof Error ? err.message : 'Identification failed.';
        primary.name = 'Untitled item';
        return;
    }
    if (items.length === 0) {
        primary.status = 'ready';
        primary.name = 'Untitled item';
        primary.lookupStatus = 'skipped';
        primary.lookupMessage = geminiConfigured() ? 'Could not pick out items in this photo.' : 'Photo identification needs a Gemini key (GEMINI_API_KEY).';
        return;
    }
    const [first, ...rest] = items;
    const enriched = await enrichIdentification(first);
    Object.assign(primary, {
        status: 'ready' as const,
        category: enriched.category,
        name: enriched.name || 'Untitled item',
        brand: enriched.brand,
        model: enriched.model,
        serialNumber: enriched.serialNumber,
        condition: enriched.condition,
        details: enriched.details,
        confidence: first.confidence,
        notes: first.notes,
        lookupStatus: enriched.lookupStatus,
        lookupMessage: enriched.lookupMessage,
        suggestedValue: enriched.suggestedValue,
        quickSale: enriched.quickSale
    });
    for (const item of rest) {
        if (photoCount(doc) >= MAX_CAPTURE_PHOTOS) break;
        const sibling = blankDraft(`${primary.groupId}-${doc.drafts.length}`, primary.photos[0]);
        const next = await enrichIdentification(item);
        Object.assign(sibling, {
            status: 'ready' as const,
            category: next.category,
            name: next.name || 'Untitled item',
            brand: next.brand,
            model: next.model,
            serialNumber: next.serialNumber,
            condition: next.condition,
            details: next.details,
            confidence: item.confidence,
            notes: item.notes,
            lookupStatus: next.lookupStatus,
        lookupMessage: next.lookupMessage,
        suggestedValue: next.suggestedValue,
        quickSale: next.quickSale
    });
        doc.drafts.push(sibling);
    }
}

captureRouter.post('/capture-sessions', async (req, res) => {
    const ownerId = ownerIdOf(res);
    const body = (req.body ?? {}) as { mode?: unknown; assetId?: unknown };
    const mode: CaptureMode = body.mode === 'catalog' ? 'catalog' : 'once';
    let assetId: string | null = null;
    if (typeof body.assetId === 'string' && body.assetId) {
        if (!/^[a-f0-9]{24}$/i.test(body.assetId)) throw notFound('That asset');
        const asset = await Asset.findOne({ _id: body.assetId, ownerId }).lean();
        if (!asset) throw notFound('That asset');
        assetId = body.assetId;
    }
    const token = newCaptureToken();
    const created = await CaptureSession.create({
        ownerId,
        tokenHash: hashCaptureToken(token),
        mode,
        assetId,
        expiresAt: new Date(Date.now() + captureTtlMs(mode)),
        claimedAt: null,
        clientHash: null,
        revokedAt: null,
        drafts: []
    });
    res.status(201).json(viewOf(created.toObject() as WithId<SessionDoc>, token));
});

captureRouter.get('/capture-sessions/:id', async (req, res) => {
    const ownerId = ownerIdOf(res);
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw notFound('That capture session');
    const doc = await CaptureSession.findOne({ _id: req.params.id, ownerId }).lean<WithId<SessionDoc>>();
    if (!doc) throw notFound('That capture session');
    res.json(viewOf(doc));
});

captureRouter.post('/capture-sessions/:id/revoke', async (req, res) => {
    const ownerId = ownerIdOf(res);
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw notFound('That capture session');
    const doc = await CaptureSession.findOne({ _id: req.params.id, ownerId });
    if (!doc) throw notFound('That capture session');
    doc.revokedAt = new Date();
    await doc.save();
    res.json(viewOf(doc.toObject() as WithId<SessionDoc>));
});

captureRouter.post('/capture-sessions/:id/drafts/:draftId/discard', async (req, res) => {
    const doc = await owned(req.params.id, ownerIdOf(res));
    const draft = doc.drafts.find((d) => d.id === req.params.draftId);
    if (!draft) throw notFound('That draft');
    draft.status = 'discarded';
    maybeCloseOnce(doc);
    doc.markModified('drafts');
    await doc.save();
    res.json(viewOf(doc.toObject() as WithId<SessionDoc>));
});

captureRouter.post('/capture-sessions/:id/drafts/:draftId/confirm', async (req, res) => {
    const ownerId = ownerIdOf(res);
    const doc = await owned(req.params.id, ownerId);
    const draft = doc.drafts.find((d) => d.id === req.params.draftId);
    if (!draft || draft.status === 'discarded') throw notFound('That draft');
    if (draft.status === 'confirmed' && draft.assetId) {
        res.json({ assetId: draft.assetId, session: viewOf(doc.toObject() as WithId<SessionDoc>) });
        return;
    }
    if (draft.status === 'identifying') throw new HttpError(409, 'not_ready', 'That photo is still being identified.');
    if (!doc.assetId) applyApproval(draft, req.body);

    const assetId = doc.assetId ? await appendPhotos(ownerId, doc.assetId, draft) : await createFromDraft(ownerId, draft);
    draft.status = 'confirmed';
    draft.assetId = assetId;
    maybeCloseOnce(doc);
    doc.markModified('drafts');
    await doc.save();
    res.status(201).json({ assetId, session: viewOf(doc.toObject() as WithId<SessionDoc>) });
});

async function owned(id: string, ownerId: string) {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw notFound('That capture session');
    const doc = await CaptureSession.findOne({ _id: id, ownerId });
    if (!doc) throw notFound('That capture session');
    const status = captureStatus({ revokedAt: doc.revokedAt ? doc.revokedAt.toISOString() : null, expiresAt: doc.expiresAt.toISOString() });
    if (status !== 'open') throw new HttpError(410, 'capture_closed', 'This capture session is closed.');
    return doc;
}

function maybeCloseOnce(doc: SessionDoc) {
    if (doc.mode !== 'once') return;
    const pending = doc.drafts.some((d) => d.status === 'identifying' || d.status === 'ready');
    if (!pending) doc.revokedAt = new Date();
}

async function appendPhotos(ownerId: string, assetId: string, draft: CaptureDraft): Promise<string> {
    const asset = await Asset.findOne({ _id: assetId, ownerId });
    if (!asset) throw notFound('That asset');
    const photos = [...(asset.photos ?? []), ...draft.photos];
    asset.photos = photos;
    asset.markModified('photos');
    await asset.save();
    return String(asset._id);
}

function textOrNull(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
}

function coerceDetails(category: CategoryId | null, raw: Details): Details {
    if (!category || !isCategoryId(category)) return {};
    const out: Details = {};
    for (const field of getCategory(category).fields) {
        const value = raw[field.key];
        if (value == null || value === '') continue;
        if (field.type === 'number' || field.type === 'integer') {
            const n = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(n)) continue;
            out[field.key] = field.type === 'integer' ? Math.round(n) : n;
        } else if (field.type === 'boolean') {
            out[field.key] = value === true || value === 'true';
        } else if (typeof value === 'string' && value.trim()) {
            out[field.key] = value.trim().slice(0, field.maxLength ?? 200);
        }
    }
    return out;
}

function applyApproval(draft: CaptureDraft, body: unknown) {
    if (!body || typeof body !== 'object') return;
    const input = body as Partial<CaptureApproval>;
    if (!('name' in input) && !('category' in input)) return;
    if (typeof input.category === 'string' && isCategoryId(input.category)) draft.category = input.category;
    if (typeof input.name === 'string') {
        const name = input.name.trim();
        if (!name) throw new HttpError(400, 'validation', 'Add a name before saving.');
        draft.name = name.slice(0, 120);
    }
    if ('brand' in input) draft.brand = textOrNull(input.brand, 80);
    if ('model' in input) draft.model = textOrNull(input.model, 120);
    if ('serialNumber' in input) draft.serialNumber = textOrNull(input.serialNumber, 80);
    if ('condition' in input) {
        draft.condition = typeof input.condition === 'string' && (CONDITIONS as readonly string[]).includes(input.condition) ? (input.condition as CaptureDraft['condition']) : null;
    }
    if (input.details && typeof input.details === 'object') draft.details = coerceDetails(draft.category, input.details);
    if ('purchasePriceCents' in input) {
        const paid = input.purchasePriceCents;
        if (typeof paid !== 'number' || !Number.isFinite(paid) || paid < 0) throw new HttpError(400, 'validation', 'Enter what you paid. Use 0 if it was a gift.');
        draft.purchasePriceCents = Math.round(paid);
    }
    if ('valueCents' in input) draft.suggestedValue = reviewedPrice(draft.suggestedValue, input.valueCents, input.valueSource, 'Fair market value');
    if ('quickSaleCents' in input) draft.quickSale = reviewedPrice(draft.quickSale, input.quickSaleCents, input.quickSaleSource, 'Quick-sale value');
}

// the value as confirmed on the review screen. it keeps a source only while it is still that source's
// amount: the photo's suggestion, or the price check the review screen ran. anything typed is a manual entry
function reviewedPrice(current: CaptureDraft['suggestedValue'], cents: number | null | undefined, claimed: unknown, label: string): CaptureDraft['suggestedValue'] {
    if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) throw new HttpError(400, 'validation', `Enter a ${label.toLowerCase()}.`);
    const amountCents = Math.round(cents);
    const source = claimed && typeof claimed === 'object' ? (claimed as Partial<ReviewedSource>) : null;
    const sourceName = textOrNull(source?.sourceName, 80);
    if (sourceName && sourceName !== REVIEW_MANUAL_SOURCE) {
        const same = current != null && current.sourceName === sourceName && current.amountCents === amountCents;
        return { amountCents, lowCents: same ? current.lowCents : null, highCents: same ? current.highCents : null, sourceName, notes: textOrNull(source?.notes, 1000) ?? '' };
    }
    if (current && current.amountCents === amountCents) return current;
    return { amountCents, lowCents: null, highCents: null, sourceName: REVIEW_MANUAL_SOURCE, notes: '' };
}

// a typed-in review value is saved as a manual entry, without a provider name
function valuationSource(v: NonNullable<CaptureDraft['suggestedValue']>) {
    const manual = v.sourceName === REVIEW_MANUAL_SOURCE;
    return { source: manual ? ('user' as const) : ('provider' as const), sourceName: manual ? null : v.sourceName, notes: v.notes || null };
}

async function createFromDraft(ownerId: string, draft: CaptureDraft): Promise<string> {
    const category: CategoryId = draft.category && isCategoryId(draft.category) ? draft.category : 'other';
    const condition = draft.condition && (CONDITIONS as readonly string[]).includes(draft.condition) ? draft.condition : null;
    let details = {};
    try {
        details = cleanDetails(category, draft.details);
    } catch {
        details = {};
    }
    // check before creating anything, so a rejected save never leaves a half-made asset behind
    if (draft.purchasePriceCents == null || !draft.suggestedValue || draft.suggestedValue.amountCents <= 0 || !draft.quickSale || draft.quickSale.amountCents <= 0) {
        throw new HttpError(400, 'validation', 'Fair market, quick-sale, and cost basis are all required.');
    }
    const fair = draft.suggestedValue;
    const quick = draft.quickSale;
    const created = await Asset.create({
        ownerId,
        name: (draft.name || 'Untitled item').slice(0, 120),
        category,
        brand: draft.brand,
        model: draft.model,
        location: null,
        condition,
        purchaseDate: null,
        purchasePriceCents: draft.purchasePriceCents,
        currency: 'USD',
        serialNumber: draft.serialNumber,
        notes: draft.notes,
        details,
        photos: draft.photos,
        isSample: false
    });
    await Valuation.create({
        ownerId,
        assetId: created._id,
        valueType: 'fair_market',
        amountCents: fair.amountCents,
        lowCents: fair.lowCents,
        highCents: fair.highCents,
        currency: 'USD',
        observedAt: todayUtc(),
        ...valuationSource(fair)
    });
    await Valuation.create({
        ownerId,
        assetId: created._id,
        valueType: 'liquidation',
        amountCents: quick.amountCents,
        lowCents: quick.lowCents,
        highCents: quick.highCents,
        currency: 'USD',
        observedAt: todayUtc(),
        ...valuationSource(quick)
    });
    return String((created.toObject() as WithId<AssetDoc>)._id);
}
