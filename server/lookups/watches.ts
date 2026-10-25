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
    if (!brand) return null;
    const modelRaw = typeof data.model === 'string' ? data.model.trim() : null;
    return {
        brand,
        referenceNumber: referenceNumber || '—',
        model: stripBrandFromModel(brand, modelRaw),
        movement: normalizeMovement(data.movement),
        caseSizeMm: parseCaseSizeMm(data.case_diameter ?? data.caseDiameter),
        caseMaterial: typeof data.case_material === 'string' ? data.case_material : null,
        yearsProduced: typeof data.year_of_production === 'string' ? data.year_of_production : null
    };
}

function priceModelFromRow(row: unknown, match: WatchMatch): string {
    const data = asRecord(row);
    const raw = typeof data?.model === 'string' ? data.model.trim() : '';
    if (raw) return raw;
    if (match.model) return `${match.brand} ${match.model}`.trim();
    return match.brand;
}

/** Latest asking price from price/history payloads (first row is most recent). */
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

type WatchLookupHints = { brand: string; reference?: string; model?: string | null; name?: string | null };

function searchText(hints: WatchLookupHints): { text: string; byReference: boolean } {
    const reference = hints.reference?.trim() ?? '';
    const brand = hints.brand.trim();
    const model = hints.model?.trim() ?? '';
    const name = hints.name?.trim() ?? '';
    if (reference.length >= 3) return { text: reference, byReference: true };
    if (brand && model.length >= 2) return { text: `${brand} ${model}`, byReference: false };
    if (model.length >= 3) return { text: model, byReference: false };
    if (name.length >= 3) return { text: name, byReference: false };
    if (reference) return { text: reference, byReference: true };
    return { text: brand, byReference: false };
}

function brandMatches(wanted: string, actual: string): boolean {
    if (!wanted.trim()) return true;
    return wanted.trim().toLowerCase() === actual.trim().toLowerCase();
}

async function readApiError(res: Response): Promise<{ code?: string; message?: string } | null> {
    try {
        const err = (await res.json()) as { error?: { code?: string; message?: string } };
        return err.error ?? null;
    } catch {
        return null;
    }
}

async function apiGet(path: string, params: Record<string, string>, opts: { prices?: boolean; soft?: boolean } = {}): Promise<unknown> {
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
        if (opts.soft && (err?.code === 'usage_limit_reached' || err?.code === 'endpoint_access_restricted')) {
            return { softError: true, message: err?.message ?? 'The Watch API is unavailable right now.' };
        }
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

async function modelSearchRows(search: string, brand?: string): Promise<unknown[]> {
    const params: Record<string, string> = {
        search,
        search_attributes: 'model,description,brand,reference_number'
    };
    if (brand?.trim()) params.brand = brand.trim();
    const payload = await apiGet('model/search', params, { soft: true });
    const blocked = asRecord(payload);
    if (blocked?.softError) return [];
    const root = asRecord(payload);
    return root && Array.isArray(root.data) ? root.data : [];
}

function collectMatches(rows: unknown[], hints: WatchLookupHints, byReference: boolean, referenceNeedle: string): WatchMatch[] {
    const brand = hints.brand.trim();
    const matches: WatchMatch[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const match = mapWatchSearchRow(row);
        if (!match) continue;
        const key = `${match.brand}|${match.referenceNumber}|${match.model ?? ''}`.toLowerCase();
        if (seen.has(key)) continue;
        if (brand && !brandMatches(brand, match.brand)) continue;
        if (byReference && referenceNeedle.length >= 3) {
            const ref = match.referenceNumber.toLowerCase();
            const needle = referenceNeedle.toLowerCase();
            if (ref !== '—' && !ref.includes(needle) && !needle.includes(ref)) continue;
        }
        seen.add(key);
        matches.push(match);
        if (matches.length >= 8) break;
    }
    return matches;
}

async function searchMatches(hints: WatchLookupHints): Promise<WatchMatch[]> {
    const { text, byReference } = searchText(hints);
    if (text.length < 2) return [];

    let rows = await modelSearchRows(text, hints.brand);
    let matches = collectMatches(rows, hints, byReference, hints.reference?.trim() ?? '');

    if (matches.length === 0 && hints.brand.trim()) {
        rows = await modelSearchRows(text);
        matches = collectMatches(rows, hints, byReference, hints.reference?.trim() ?? '');
    }

    const ref = hints.reference?.trim() ?? '';
    if (matches.length === 0 && ref.length >= 3) {
        const byRef = await apiGet('reference/search', { search: ref }, { soft: true });
        const blocked = asRecord(byRef);
        if (!blocked?.softError) {
            const root = asRecord(byRef);
            const refRows = root && Array.isArray(root.data) ? root.data : [];
            matches = collectMatches(refRows, hints, true, ref);
        }
    }

    return matches;
}

async function resolveWatch(hints: WatchLookupHints): Promise<{ match: WatchMatch | null; priceModel: string | null }> {
    const matches = await searchMatches(hints);
    const ref = hints.reference?.trim() ?? '';
    if (ref) {
        const exact = matches.find((m) => m.referenceNumber.toLowerCase() === ref.toLowerCase());
        if (exact) {
            const row = (await modelSearchRows(ref, hints.brand))[0];
            return { match: exact, priceModel: row ? priceModelFromRow(row, exact) : null };
        }
    }
    const first = matches[0] ?? null;
    if (!first) return { match: null, priceModel: null };
    const rows = await modelSearchRows(searchText(hints).text, hints.brand);
    const row = rows[0];
    return { match: first, priceModel: row ? priceModelFromRow(row, first) : `${first.brand} ${first.model ?? ''}`.trim() };
}

function quickSaleFromFair(fairCents: number): number {
    return Math.max(1, Math.round(fairCents * 0.85));
}

async function fetchAskingPriceCents(
    refForPrice: string | null,
    priceModel: string | null
): Promise<{ fairMarketCents: number | null; priceBlocked: boolean; blockMessage: string | null; method: string | null }> {
    if (refForPrice && refForPrice !== '—') {
        const history = await apiGet('reference/price/history', { reference_number: refForPrice }, { prices: true });
        const blocked = asRecord(history)?.restricted === true;
        if (blocked) {
            const msg = asRecord(history);
            return {
                fairMarketCents: null,
                priceBlocked: true,
                blockMessage: typeof msg?.message === 'string' ? msg.message : null,
                method: null
            };
        }
        const cents = latestReferencePriceCents(history);
        if (cents) return { fairMarketCents: cents, priceBlocked: false, blockMessage: null, method: 'Reference asking-price average' };
    }

    if (priceModel) {
        const history = await apiGet('model/price/history', { model: priceModel }, { prices: true });
        const blocked = asRecord(history)?.restricted === true;
        if (blocked) {
            const msg = asRecord(history);
            return {
                fairMarketCents: null,
                priceBlocked: true,
                blockMessage: typeof msg?.message === 'string' ? msg.message : null,
                method: null
            };
        }
        const cents = latestReferencePriceCents(history);
        if (cents) return { fairMarketCents: cents, priceBlocked: false, blockMessage: null, method: 'Model asking-price average' };
    }

    return { fairMarketCents: null, priceBlocked: false, blockMessage: null, method: null };
}

export async function searchWatchMatches(q: WatchSearchQuery): Promise<WatchSearchResult> {
    const hints: WatchLookupHints = { brand: q.brand, reference: q.reference, model: q.model, name: q.name };
    const cacheKey = `${hints.brand}|${hints.reference ?? ''}|${hints.model ?? ''}|${hints.name ?? ''}`.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const matches = await searchMatches(hints);
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
    const hints: WatchLookupHints = { brand: q.brand, reference: q.reference, model: q.model, name: q.name };
    const cacheKey = `${hints.brand}|${hints.reference ?? ''}|${hints.model ?? ''}|${hints.name ?? ''}`.toLowerCase();
    const cached = valueCache.get(cacheKey);
    if (cached) return cached;

    const { match: resolved, priceModel } = await resolveWatch(hints);
    const refForPrice =
        resolved && resolved.referenceNumber !== '—'
            ? resolved.referenceNumber
            : hints.reference?.trim() || '';

    const { fairMarketCents, priceBlocked, blockMessage, method } = await fetchAskingPriceCents(
        refForPrice || null,
        priceModel
    );
    const quickSaleCents = fairMarketCents ? quickSaleFromFair(fairMarketCents) : null;
    const brandOut = resolved?.brand ?? hints.brand.trim();
    const label = searchText(hints).text || brandOut;

    const notes: string[] = [];
    if (priceBlocked) {
        notes.push(blockMessage ?? 'Asking-price history needs a The Watch API plan that includes price endpoints.');
    } else if (!resolved && !fairMarketCents) {
        notes.push(`The Watch API has no match for "${label}". Try brand + model or the list name if the reference is missing.`);
    } else if (fairMarketCents) {
        notes.push('Average asking prices in USD from The Watch API (updated daily from online listings). Not a completed-sale appraisal.');
        if (method === 'Model asking-price average') {
            notes.push('Price is for the closest model match, not necessarily your exact reference.');
        }
        if (quickSaleCents) notes.push('Quick-sale value is a typical ~85% of asking averages when you need a fast sale.');
    } else if (resolved) {
        notes.push('The Watch API found a match but did not return a recent asking price.');
    }

    const result: WatchValueResult = {
        provider: 'thewatchapi',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        brand: brandOut,
        reference: refForPrice || resolved?.referenceNumber || '—',
        fairMarketCents,
        quickSaleCents,
        sourceName: fairMarketCents ? providerLabel : null,
        method: fairMarketCents ? method : null,
        notes
    };
    if (fairMarketCents) valueCache.set(cacheKey, result);
    return result;
}
