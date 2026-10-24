// rentcast: home value estimates (an automated valuation model) plus nearby comparables.
// needs RENTCAST_API_KEY (free plan is 50 requests a month), so results are cached for a day.
// not tested against the live api yet; written from rentcast's docs for GET /v1/avm/value.

import type { PropertyValueResult } from '../../shared/schemas.js';
import { getEnv } from '../env.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const cache = new TtlCache<PropertyValueResult>(24 * 60 * 60 * 1000, 200);

const PROPERTY_TYPES: Record<string, string> = {
    single_family: 'Single Family',
    condo: 'Condo',
    townhouse: 'Townhouse',
    multi_family: 'Multi-Family',
    land: 'Land'
};

export interface PropertyQuery {
    addressLine1: string;
    city: string;
    state: string;
    postalCode?: string | null;
    propertyType?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    squareFeet?: number | null;
}

const toCents = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null);
const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

export function rentcastConfigured(): boolean {
    return getEnv().rentcastKey != null;
}

export async function lookupPropertyValue(q: PropertyQuery): Promise<PropertyValueResult> {
    const key = getEnv().rentcastKey;
    if (!key) {
        throw new HttpError(501, 'not_configured', 'Property value lookups need a RentCast API key (RENTCAST_API_KEY). See the Setup page.');
    }

    const address = [q.addressLine1, q.city, [q.state, q.postalCode].filter(Boolean).join(' ')].map((s) => s.trim()).filter(Boolean).join(', ');
    const params = new URLSearchParams({ address, compCount: '5' });
    const type = q.propertyType ? PROPERTY_TYPES[q.propertyType] : undefined;
    if (type) params.set('propertyType', type);
    if (q.bedrooms != null) params.set('bedrooms', String(q.bedrooms));
    if (q.bathrooms != null) params.set('bathrooms', String(q.bathrooms));
    if (q.squareFeet != null) params.set('squareFootage', String(q.squareFeet));

    const cacheKey = params.toString().toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    let res: Response;
    try {
        // the address goes to rentcast in its query string (their api requires it); we never log it
        res = await fetch(`https://api.rentcast.io/v1/avm/value?${params}`, {
            headers: { accept: 'application/json', 'X-Api-Key': key },
            signal: AbortSignal.timeout(12_000)
        });
    } catch {
        throw new HttpError(502, 'provider_unreachable', 'RentCast did not respond. Try again in a minute.');
    }
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'provider_auth', 'RentCast rejected the API key. Check RENTCAST_API_KEY.');
    if (res.status === 404) throw new HttpError(404, 'no_match', 'RentCast could not find that address. Check the street, city, and state.');
    if (res.status === 429) throw new HttpError(429, 'provider_quota', 'RentCast says the monthly request limit was reached.');
    if (!res.ok) throw new HttpError(502, 'provider_error', `RentCast returned an error (${res.status}).`);

    const data = (await res.json()) as Record<string, unknown>;
    const comps = Array.isArray(data.comparables) ? (data.comparables as Record<string, unknown>[]) : [];

    const result: PropertyValueResult = {
        provider: 'rentcast',
        providerLabel: 'RentCast AVM',
        fetchedAt: new Date().toISOString(),
        valueCents: toCents(data.price),
        lowCents: toCents(data.priceRangeLow),
        highCents: toCents(data.priceRangeHigh),
        comparables: comps.slice(0, 5).map((c) => ({
            address: typeof c.formattedAddress === 'string' ? c.formattedAddress : 'Nearby property',
            priceCents: toCents(c.price),
            squareFeet: num(c.squareFootage),
            bedrooms: num(c.bedrooms),
            bathrooms: num(c.bathrooms),
            distanceMiles: num(c.distance),
            status: typeof c.status === 'string' ? c.status : null
        })),
        notes: [
            'Automated estimate from listing data, not an appraisal.',
            'Comparables are recent listings near the address, not necessarily completed sales.'
        ]
    };
    cache.set(cacheKey, result);
    return result;
}
