// shapes for phone capture sessions. the raw token is shown once in a QR code and never stored.

import { getCategory, isCategoryId, type CategoryId, type Details } from './categories.js';
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
    kind: 'category' | 'name' | 'brand' | 'model' | 'serialNumber' | 'condition' | 'detail' | 'value';
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
    valueCents?: number | null;
}

// name and category are always reviewed. everything else appears only when the draft has a value.
export function reviewSteps(draft: Pick<CaptureDraft, 'category' | 'name' | 'brand' | 'model' | 'serialNumber' | 'condition' | 'details' | 'suggestedValue'>): ReviewStep[] {
    const category = draft.category && isCategoryId(draft.category) ? getCategory(draft.category) : null;
    const steps: ReviewStep[] = [
        { key: 'category', kind: 'category', label: 'Category', value: draft.category ?? '' },
        { key: 'name', kind: 'name', label: 'Name', value: draft.name ?? '' }
    ];
    const optional: ReviewStep[] = [
        { key: 'brand', kind: 'brand', label: category?.brandLabel ?? 'Brand', value: draft.brand ?? '' },
        { key: 'model', kind: 'model', label: category?.modelLabel ?? 'Model', value: draft.model ?? '' },
        { key: 'serialNumber', kind: 'serialNumber', label: 'Serial or VIN', value: draft.serialNumber ?? '' },
        { key: 'condition', kind: 'condition', label: 'Condition', value: draft.condition ?? '' }
    ];
    for (const step of optional) if (step.value) steps.push(step);
    for (const [key, raw] of Object.entries(draft.details)) {
        if (raw == null || raw === '') continue;
        const field = category?.fields.find((item) => item.key === key);
        steps.push({ key: `detail:${key}`, kind: 'detail', detailKey: key, label: field?.label ?? key, value: String(raw) });
    }
    if (draft.suggestedValue && draft.suggestedValue.amountCents > 0) {
        steps.push({ key: 'value', kind: 'value', label: 'Suggested value', value: String(draft.suggestedValue.amountCents) });
    }
    return steps;
}
