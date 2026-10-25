// shapes for phone capture sessions. the raw token is shown once in a QR code and never stored.

import { getCategory, isCategoryId, isFieldVisible, usesCommonField, type CategoryId, type Details } from './categories.js';
import { identityFields } from './identity.js';
import type { Condition } from './schemas.js';

export const PHOTO_KINDS = ['front', 'label', 'flaw', 'scene'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const CAPTURE_MODES = ['once', 'catalog'] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const CAPTURE_STATUSES = ['open', 'expired', 'revoked'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const MAX_CAPTURE_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 4_000_000;

export interface AssetPhoto {
    photoId: string;
    kind: PhotoKind;
    capturedAt: string;
}

export interface SuggestedValue {
    amountCents: number;
    lowCents: number | null;
    highCents: number | null;
    sourceName: string;
    notes: string;
}

export interface IdentifiedItem {
    category: CategoryId | null;
    name: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    condition: Condition | null;
    confidence: number | null;
    notes: string | null;
    details: Details;
}

export interface CaptureDraft {
    id: string;
    groupId: string;
    status: 'identifying' | 'ready' | 'confirmed' | 'discarded';
    photos: AssetPhoto[];
    category: CategoryId | null;
    name: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    condition: Condition | null;
    details: Details;
    confidence: number | null;
    notes: string | null;
    lookupStatus: 'pending' | 'ready' | 'skipped' | 'error';
    lookupMessage: string | null;
    suggestedValue: SuggestedValue | null;
    quickSale: SuggestedValue | null;
    purchasePriceCents: number | null;
    assetId: string | null;
}

export interface CaptureSessionView {
    id: string;
    mode: CaptureMode;
    expiresAt: string;
    status: CaptureStatus;
    assetId: string | null;
    claimed: boolean;
    drafts: CaptureDraft[];
    token?: string;
}

export interface PhoneCaptureView {
    status: CaptureStatus;
    mode: CaptureMode;
    expiresAt: string;
    photoCount: number;
    maxPhotos: number;
    storageReady: boolean;
}

export function captureTtlMs(mode: CaptureMode): number {
    return mode === 'catalog' ? 45 * 60 * 1000 : 10 * 60 * 1000;
}

export function captureStatus(input: { revokedAt: string | null; expiresAt: string }, now = Date.now()): CaptureStatus {
    if (input.revokedAt) return 'revoked';
    if (Date.parse(input.expiresAt) <= now) return 'expired';
    return 'open';
}

export interface ReviewStep {
    key: string;
    kind: 'category' | 'name' | 'brand' | 'model' | 'serialNumber' | 'condition' | 'detail' | 'purchase' | 'value' | 'quickSale';
    label: string;
    detailKey?: string;
    value: string;
}

export interface CaptureApproval {
    category: CategoryId;
    name: string;
    brand?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    condition?: Condition | null;
    details?: Details;
    purchasePriceCents?: number | null;
    valueCents?: number | null;
    quickSaleCents?: number | null;
}

function detailStep(category: ReturnType<typeof getCategory> | null, key: string, raw: unknown): ReviewStep {
    const field = category?.fields.find((item) => item.key === key);
    return { key: `detail:${key}`, kind: 'detail', detailKey: key, label: field?.label ?? key, value: raw == null || raw === '' ? '' : String(raw) };
}

// category first, then every question that category asks, then the three values.
// identity questions stay even when blank so a missed year or make can be typed in.
export function reviewSteps(draft: Pick<CaptureDraft, 'category' | 'name' | 'brand' | 'model' | 'serialNumber' | 'condition' | 'details' | 'suggestedValue'> & Partial<Pick<CaptureDraft, 'quickSale' | 'purchasePriceCents'>>): ReviewStep[] {
    const category = draft.category && isCategoryId(draft.category) ? getCategory(draft.category) : null;
    const steps: ReviewStep[] = [
        { key: 'category', kind: 'category', label: 'Category', value: draft.category ?? '' },
        { key: 'name', kind: 'name', label: 'Name', value: draft.name ?? '' }
    ];
    const asked = new Set<string>();
    if (category) {
        for (const field of identityFields(category.id)) {
            if (field === 'brand') {
                steps.push({ key: 'brand', kind: 'brand', label: category.brandLabel ?? 'Brand', value: draft.brand ?? '' });
            } else if (field === 'model') {
                steps.push({ key: 'model', kind: 'model', label: category.modelLabel ?? 'Model', value: draft.model ?? '' });
            } else {
                const key = field.slice('details.'.length);
                asked.add(key);
                steps.push(detailStep(category, key, draft.details[key]));
            }
        }
        if (usesCommonField(category.id, 'condition')) {
            steps.push({ key: 'condition', kind: 'condition', label: 'Condition', value: draft.condition ?? '' });
        }
        if (draft.serialNumber && usesCommonField(category.id, 'serialNumber')) {
            steps.push({ key: 'serialNumber', kind: 'serialNumber', label: 'Serial number', value: draft.serialNumber });
        }
        for (const field of category.fields) {
            if (asked.has(field.key) || !isFieldVisible(field, draft.details)) continue;
            const raw = draft.details[field.key];
            if (raw == null || raw === '') continue;
            steps.push(detailStep(category, field.key, raw));
        }
    }
    steps.push({ key: 'purchase', kind: 'purchase', label: 'Purchase price', value: draft.purchasePriceCents != null ? String(draft.purchasePriceCents) : '' });
    steps.push({ key: 'value', kind: 'value', label: 'Fair market value', value: draft.suggestedValue && draft.suggestedValue.amountCents > 0 ? String(draft.suggestedValue.amountCents) : '' });
    steps.push({ key: 'quickSale', kind: 'quickSale', label: 'Quick-sale value', value: draft.quickSale && draft.quickSale.amountCents > 0 ? String(draft.quickSale.amountCents) : '' });
    return steps;
}
