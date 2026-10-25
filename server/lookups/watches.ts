// The Watch API — reference search, model metadata, and asking-price history.
// https://www.thewatchapi.com/documentation

import type { WatchSearchQuery, WatchSearchResult, WatchValueQuery, WatchValueResult, WatchMatch } from '../../shared/schemas.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const providerLabel = 'The Watch API';
const baseUrl = 'https://api.thewatchapi.com/v1';
const valueCache = new TtlCache<WatchValueResult>(6 * 60 * 60 * 1000, 200);
const searchCache = new TtlCache<WatchSearchResult>(30 * 60 * 1000, 200);

/** @deprecated use theWatchApiConfigured */
export const watchChartsConfigured = theWatchApiConfigured;

function watchApiToken(): string | null {
    return process.env.THEWATCH_API_KEY?.trim() || process.env.THEWATCHAPI_TOKEN?.trim() || null;
}

export function theWatchApiConfigured(): boolean {
    return !!watchApiToken();
}

function apiKey(): string {
    const key = watchApiToken();
    if (!key) throw new HttpError(501, 'not_configured', 'Watch prices need a The Watch API key (THEWATCH_API_KEY). See the Setup page.');
    return key;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function dollarsToCents(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
}

function normalizeMovement(raw: unknown): WatchMatch['movement'] {
    const s = typeof raw === 'string' ? raw.toLowerCase() : '';
    if (s.includes('automatic')) return 'automatic';
    if (s.includes('manual')) return 'manual';
    if (s.includes('quartz')) return 'quartz';
    return s ? 'other' : null;
}

function parseCaseSizeMm(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const s = typeof raw === 'string' ? raw : '';
    const m = s.match(/([\d.]+)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}

function stripBrandFromModel(brand: string, model: string | null): string | null {
    if (!model) return null;
    const b = brand.trim();
    if (!b) return model;
    const lower = model.toLowerCase();
    const prefix = b.toLowerCase();
    if (lower.startsWith(prefix + ' ')) return model.slice(b.length + 1).trim() || model;
    return model;
}

export function mapWatchSearchRow(row: unknown): WatchMatch | null {
    const data = asRecord(row);
    if (!data) return null;
    const brand = typeof data.brand === 'string' ? data.brand.trim() : '';
    const referenceNumber =
        typeof data.reference_number === 'string'
            ? data.reference_number.trim()
            : typeof data.referenceNumber === 'string'
              ? data.referenceNumber.trim()
              : '';
    if (!brand || !referenceNumber) return null;
    const modelRaw = typeof data.model === 'string' ? data.model.trim() : null;
    return {
        brand,
        referenceNumber,
        model: stripBrandFromModel(brand, modelRaw),
        movement: normalizeMovement(data.movement),
        caseSizeMm: parseCaseSizeMm(data.case_diameter ?? data.caseDiameter),
        caseMaterial: typeof data.case_material === 'string' ? data.case_material : null,
        yearsProduced: typeof data.year_of_production === 'string' ? data.year_of_production : null
    };
}

/** Latest asking price from reference/price/history (first row is most recent). */
export function latestReferencePriceCents(payload: unknown): number | null {
    const root = asRecord(payload);
    if (!root) return null;
    const rows = Array.isArray(root.data) ? root.data : [];
    for (const row of rows) {
        const record = asRecord(row);
        const cents = record ? dollarsToCents(record.price) : null;
        if (cents) return cents;
    }
    return null;
}

async function readApiError(res: Response): Promise<{ code?: string; message?: string } | null> {
    try {
        const err = (await res.json()) as { error?: { code?: string; message?: string } };
        return err.error ?? null;
    } catch {
        return null;
    }
}

async function apiGet(path: string, params: Record<string, string>, opts: { prices?: boolean } = {}): Promise<unknown> {
    const url = new URL(`${baseUrl}/${path.replace(/^\//, '')}`);
    url.searchParams.set('api_token', apiKey());
    for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
    }
    let res: Response;
    try {
        res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    } catch {
        throw new HttpError(502, 'provider_unreachable', 'The Watch API did not respond. Try again in a minute.');
    }
    if (res.status === 429) throw new HttpError(429, 'provider_quota', 'The Watch API is rate limiting us. Wait a minute and try again.');
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
        const err = await readApiError(res);
        if (opts.prices && err?.code === 'endpoint_access_restricted') return { restricted: true, message: err.message };
        if (res.status === 401 || err?.code === 'invalid_api_token') {
            throw new HttpError(502, 'provider_auth', 'The Watch API rejected the API key. Check THEWATCH_API_KEY.');
        }
        throw new HttpError(502, 'provider_error', err?.message ?? `The Watch API returned an error (${res.status}).`);
    }
    if (!res.ok) {
        const err = await readApiError(res);
        throw new HttpError(502, 'provider_error', err?.message ?? `The Watch API returned an error (${res.status}).`);
    }
    return res.json();
}

async function resolveWatch(brand: string, reference: string): Promise<WatchMatch | null> {
    const ref = reference.trim();
    const b = brand.trim();
    if (ref.length >= 3) {
        const byRef = await apiGet('reference/search', { search: ref });
        const root = asRecord(byRef);
        const rows = root && Array.isArray(root.data) ? root.data : [];
        for (const row of rows) {
            const match = mapWatchSearchRow(row);
            if (!match) continue;
            if (b && match.brand.toLowerCase() !== b.toLowerCase()) continue;
            return match;
        }
        if (rows.length === 1) {
            const only = mapWatchSearchRow(rows[0]);
            if (only) return only;
        }
    }
    if (!b) return null;
    const detail = await apiGet('model/search', {
        search: ref || b,
        search_attributes: 'reference_number,model',
        brand: b,
        reference_number: ref
    });
    const detailRoot = asRecord(detail);
    const detailRows = detailRoot && Array.isArray(detailRoot.data) ? detailRoot.data : [];
    for (const row of detailRows) {
        const match = mapWatchSearchRow(row);
        if (match && (!ref || match.referenceNumber.toLowerCase() === ref.toLowerCase())) return match;
    }
    return detailRows[0] ? mapWatchSearchRow(detailRows[0]) : null;
}

function quickSaleFromFair(fairCents: number): number {
    return Math.max(1, Math.round(fairCents * 0.85));
}

export async function searchWatchMatches(q: WatchSearchQuery): Promise<WatchSearchResult> {
    const brand = q.brand.trim();
    const reference = q.reference.trim();
    const cacheKey = `${brand}|${reference}`.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = { search: reference, search_attributes: 'reference_number,model,brand' };
    if (brand) params.brand = brand;

    const payload = await apiGet('model/search', params);
    const root = asRecord(payload);
    const rows = root && Array.isArray(root.data) ? root.data : [];
    const matches: WatchMatch[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const match = mapWatchSearchRow(row);
        if (!match) continue;
        const key = `${match.brand}|${match.referenceNumber}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (brand && match.brand.toLowerCase() !== brand.toLowerCase()) continue;
        if (!match.referenceNumber.toLowerCase().includes(reference.toLowerCase())) continue;
        matches.push(match);
        if (matches.length >= 8) break;
    }

    const result: WatchSearchResult = {
        provider: 'thewatchapi',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        matches
    };
    if (matches.length) searchCache.set(cacheKey, result);
    return result;
}

export async function lookupWatchValue(q: WatchValueQuery): Promise<WatchValueResult> {
    const brand = q.brand.trim();
    const reference = q.reference.trim();
    const cacheKey = `${brand}|${reference}|${q.model ?? ''}`.toLowerCase();
    const cached = valueCache.get(cacheKey);
    if (cached) return cached;

    const resolved = await resolveWatch(brand, reference);
    const refForPrice = resolved?.referenceNumber ?? reference;
    const brandOut = resolved?.brand ?? brand;

    const history = await apiGet('reference/price/history', { reference_number: refForPrice }, { prices: true });
    const priceBlocked = asRecord(history)?.restricted === true;
    const fairMarketCents = priceBlocked ? null : latestReferencePriceCents(history);
    const quickSaleCents = fairMarketCents ? quickSaleFromFair(fairMarketCents) : null;

    const notes: string[] = [];
    if (priceBlocked) {
        const blocked = asRecord(history);
        notes.push(
            typeof blocked?.message === 'string'
                ? blocked.message
                : 'Asking-price history needs a The Watch API plan that includes price endpoints. Reference search still works.'
        );
    } else if (!resolved && !fairMarketCents) {
        notes.push(`The Watch API has no ${brandOut} ${refForPrice}. Check the reference on the case back.`);
    } else if (fairMarketCents) {
        notes.push('Average asking prices in USD from The Watch API (updated daily from online listings). Not a completed-sale appraisal.');
        if (quickSaleCents) notes.push('Quick-sale value is a typical ~85% of asking averages when you need a fast sale.');
    } else if (resolved) {
        notes.push('The Watch API recognized the reference but did not return a recent asking price.');
    }

    const result: WatchValueResult = {
        provider: 'thewatchapi',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        brand: brandOut,
        reference: refForPrice,
        fairMarketCents,
        quickSaleCents,
        sourceName: fairMarketCents ? providerLabel : null,
        method: fairMarketCents ? 'Reference asking-price average' : null,
        notes
    };
    if (fairMarketCents) valueCache.set(cacheKey, result);
    return result;
}
