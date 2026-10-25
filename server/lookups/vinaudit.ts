// vinaudit market values: retail and trade-in prices for a vin, adjusted for mileage, condition,
// and title problems, from recent listings. needs VINAUDIT_API_KEY (trial: 100 queries).
// each lookup is two queries (retail + trade-in), so results are cached for a day.
// not tested against the live api yet (the demo key doesn't cover market values); written from
// vinaudit's docs for GET /v2/marketvalue. errors come back as http 200 with success: false.

import type { Condition, VehicleMarketValue, VehicleValueQuery, VehicleValueResult } from '../../shared/schemas.js';
import { getEnv } from '../env.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const providerLabel = 'VinAudit';
const cache = new TtlCache<VehicleValueResult>(24 * 60 * 60 * 1000, 200);

// our five conditions onto vinaudit's three
const CONDITION: Record<Condition, string> = { new: 'like_new', excellent: 'like_new', good: 'average', fair: 'not_great', poor: 'not_great' };
// title problems vinaudit prices in. a lien doesn't change what the car is worth
const TITLE_DAMAGE: Record<string, string> = { salvage: 'salvage', rebuilt: 'brand' };

const ADJUSTMENT_LABELS: Record<string, string> = { mileage: 'Mileage', history: 'History records', condition: 'Condition', known_damage: 'Title' };

export function vinauditConfigured(): boolean {
    return getEnv().vinauditKey != null;
}

const toCents = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null);

function errorFor(code: string): HttpError {
    switch (code) {
        case 'invalid_key':
        case 'missing_key':
            return new HttpError(502, 'provider_auth', 'VinAudit rejected the API key. Check VINAUDIT_API_KEY.');
        case 'api_not_enabled':
            return new HttpError(502, 'provider_auth', "This VinAudit key doesn't include Market Values. Ask VinAudit to turn it on for your account.");
        case 'rate_limit_exceeded':
        case 'billing_limit_exceeded':
            return new HttpError(429, 'provider_quota', 'VinAudit says the account is out of queries. The trial allows 100, and each lookup uses 2.');
        case 'invalid_vin':
            return new HttpError(404, 'no_match', "VinAudit couldn't decode this VIN. Check it against the title or the driver's side dashboard.");
        case 'no_data':
            return new HttpError(404, 'no_data', 'VinAudit has too few recent sales of this vehicle to give a reliable value.');
        default:
            return new HttpError(502, 'provider_error', 'VinAudit could not price this vehicle right now. Try again in a few minutes.');
    }
}

type Raw = Record<string, unknown>;

async function marketValue(params: URLSearchParams): Promise<Raw> {
    let res: Response;
    try {
        // the key has to go in the query string (vinaudit's api); we never log the url
        res = await fetch(`https://marketvalue.vinaudit.com/v2/marketvalue?${params}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(15_000)
        });
    } catch {
        throw new HttpError(502, 'provider_unreachable', 'VinAudit did not respond. Try again in a minute.');
    }
    if (!res.ok) throw new HttpError(502, 'provider_error', `VinAudit returned an error (${res.status}).`);
    const data = (await res.json()) as Raw;
    if (data.success !== true) throw errorFor(typeof data.error === 'string' ? data.error : '');
    return data;
}

function toMarketValue(data: Raw): VehicleMarketValue | null {
    const prices = (data.prices ?? {}) as Raw;
    const valueCents = toCents(prices.average) ?? toCents(data.mean);
    if (valueCents == null || valueCents <= 0) return null;
    return {
        valueCents,
        lowCents: toCents(prices.below),
        highCents: toCents(prices.above),
        sampleCount: typeof data.count === 'number' ? data.count : null,
        certainty: typeof data.certainty === 'number' ? data.certainty : null
    };
}

export async function lookupVehicleValue(q: VehicleValueQuery): Promise<VehicleValueResult> {
    const key = getEnv().vinauditKey;
    if (!key) {
        throw new HttpError(501, 'not_configured', 'Vehicle market values need a VinAudit API key (VINAUDIT_API_KEY). See the Setup page.');
    }

    const params = new URLSearchParams({ key, vin: q.vin.toUpperCase(), format: 'json', period: '90', country: 'usa' });
    params.set('mileage', q.mileage != null ? String(q.mileage) : 'average');
    if (q.condition) params.set('condition', CONDITION[q.condition]);
    const damage = q.titleStatus ? TITLE_DAMAGE[q.titleStatus] : undefined;
    if (damage) params.set('known_damage', damage);

    const cacheKey = [q.vin, q.mileage ?? 'avg', q.condition ?? '', damage ?? ''].join('|').toUpperCase();
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const retailParams = new URLSearchParams(params);
    retailParams.set('type', 'retail');
    const tradeParams = new URLSearchParams(params);
    tradeParams.set('type', 'tradein');

    // a missing trade-in value shouldn't throw away a good retail one (and the other way round)
    const [retailRes, tradeRes] = await Promise.allSettled([marketValue(retailParams), marketValue(tradeParams)]);
    if (retailRes.status === 'rejected' && tradeRes.status === 'rejected') throw retailRes.reason;

    const retailRaw = retailRes.status === 'fulfilled' ? retailRes.value : null;
    const tradeRaw = tradeRes.status === 'fulfilled' ? tradeRes.value : null;
    const main = (retailRaw ?? tradeRaw)!;

    const period = Array.isArray(main.period) && typeof main.period[0] === 'string' && typeof main.period[1] === 'string' ? { from: main.period[0], to: main.period[1] } : null;

    const adjustments: { label: string; cents: number }[] = [];
    for (const [k, v] of Object.entries((main.adjustments ?? {}) as Raw)) {
        const cents = toCents((v as Raw | null)?.adjustment);
        if (cents) adjustments.push({ label: ADJUSTMENT_LABELS[k] ?? k, cents });
    }

    const notes = [
        'Retail is what dealers list similar cars for. Trade-in is what a dealer would offer you. Private sales usually land in between.',
        'Estimates from recent listings, not an appraisal. Options, accident history, and local demand can move the real price.'
    ];
    if (q.mileage == null) notes.unshift('No mileage entered, so VinAudit assumed average mileage for this car. Add it (Edit) for a closer number.');

    const result: VehicleValueResult = {
        provider: 'vinaudit',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        vehicle: typeof main.vehicle === 'string' ? main.vehicle : null,
        mileage: typeof main.mileage === 'number' ? Math.round(main.mileage) : (q.mileage ?? null),
        retail: retailRaw ? toMarketValue(retailRaw) : null,
        tradeIn: tradeRaw ? toMarketValue(tradeRaw) : null,
        period,
        adjustments,
        notes
    };
    cache.set(cacheKey, result);
    return result;
}
