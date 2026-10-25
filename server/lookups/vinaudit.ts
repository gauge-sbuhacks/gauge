// Retail and trade-in values by VIN or a provider-selected year/make/model/trim ID.
// Two price requests, plus a cached selections request when no VIN is supplied.

import { vehicleValueQuerySchema, type Condition, type VehicleMarketValue, type VehicleValueQuery, type VehicleValueResult } from '../../shared/schemas.js';
import { getEnv } from '../env.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const providerLabel = 'VinAudit';
const cache = new TtlCache<VehicleValueResult>(24 * 60 * 60 * 1000, 200);
type TrimOption = { id: string; name: string };
const selectionsCache = new TtlCache<TrimOption[]>(24 * 60 * 60 * 1000, 200);

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
            return new HttpError(429, 'provider_quota', 'VinAudit says the account is out of queries. Check the account quota before trying again.');
        case 'invalid_vin':
            return new HttpError(404, 'no_match', "VinAudit couldn't decode this VIN. Check it against the title or the driver's side dashboard.");
        case 'no_data':
            return new HttpError(404, 'no_data', 'VinAudit has too few recent sales of this vehicle to give a reliable value.');
        default:
            return new HttpError(502, 'provider_error', 'VinAudit could not price this vehicle right now. Try again in a few minutes.');
    }
}

type Raw = Record<string, unknown>;

async function providerRequest(endpoint: string, params: URLSearchParams, selections = false): Promise<Raw> {
    let res: Response;
    try {
        // the key has to go in the query string (vinaudit's api); we never log the url
        res = await fetch(`${endpoint}?${params}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(15_000)
        });
    } catch {
        throw new HttpError(502, 'provider_unreachable', 'VinAudit did not respond. Try again in a minute.');
    }
    if (res.status === 401 || res.status === 403) throw new HttpError(502, 'provider_auth', selections
        ? 'VinAudit denied Vehicle Selections access. Check VINAUDIT_API_KEY and enable Specifications / Vehicle Selections on the account. A full VIN uses Market Values directly.'
        : 'VinAudit denied Market Values access. Check VINAUDIT_API_KEY and enable Market Values on the account.');
    if (!res.ok) throw new HttpError(502, 'provider_error', `VinAudit returned an error (${res.status}).`);
    let data: Raw;
    try {
        data = (await res.json()) as Raw;
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response');
    } catch {
        throw new HttpError(502, 'provider_error', 'VinAudit returned an unreadable response. Try again later.');
    }
    if (selections && data.error === 'api_not_enabled') {
        throw new HttpError(502, 'provider_auth', 'VIN-free estimates need VinAudit Specifications / Vehicle Selections enabled on this API key. You can still use a full VIN with Market Values.');
    }
    if (data.error || data.success === false || (!selections && data.success !== true)) throw errorFor(typeof data.error === 'string' ? data.error : '');
    return data;
}

const marketValue = (params: URLSearchParams) => providerRequest('https://marketvalue.vinaudit.com/v2/marketvalue', params);

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

async function resolveTrim(q: VehicleValueQuery, key: string): Promise<NonNullable<VehicleValueResult['trimSelection']> & { id: string }> {
    const cacheKey = JSON.stringify([key, q.year, normalize(q.make!), normalize(q.model!)]);
    let options = selectionsCache.get(cacheKey);
    if (!options) {
        const params = new URLSearchParams({ key, format: 'json', list: 'year+make+model+trim', year: String(q.year), make: q.make!, model: q.model! });
        const data = await providerRequest('https://specifications.vinaudit.com/v3/selections', params, true);
        // Follow only the requested year/make/model, even if the provider returns a broader tree.
        const records = (v: unknown): Raw[] => Array.isArray(v) ? v.filter((x): x is Raw => x != null && typeof x === 'object') : [];
        const years = records((data.selections as Raw | undefined)?.years).filter((x) => String(x.name) === String(q.year));
        const makes = years.flatMap((x) => records(x.makes)).filter((x) => typeof x.name === 'string' && normalize(x.name) === normalize(q.make!));
        const models = makes.flatMap((x) => records(x.models)).filter((x) => typeof x.name === 'string' && normalize(x.name) === normalize(q.model!));
        options = models.flatMap((x) => records(x.trims)).flatMap((x) => typeof x.id === 'string' && typeof x.name === 'string' && x.id && x.name ? [{ id: x.id, name: x.name }] : []);
        options = [...new Map(options.map((x) => [x.id, x])).values()].sort((a, b) => a.name.localeCompare(b.name));
        if (!options.length) throw new HttpError(404, 'no_match', 'VinAudit could not find this year, make, and model. Check the spelling, or use a VIN.');
        selectionsCache.set(cacheKey, options);
    }
    const requested = q.trim?.trim();
    const matched = requested ? options.find((x) => normalize(x.name) === normalize(requested)) : undefined;
    if (requested && !matched) throw new HttpError(404, 'no_match', `Trim not found. Available trims: ${options.map((x) => x.name).join(', ')}. Clear the trim for a rough estimate.`);
    // A reference trim is explicit and never silently recorded as the actual vehicle's trim.
    const selected = matched ?? options.find((x) => normalize(x.name) === 'base') ?? options[0];
    return { ...selected, assumed: !matched, options };
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
    q = vehicleValueQuerySchema.parse(q);
    const key = getEnv().vinauditKey;
    if (!key) {
        throw new HttpError(501, 'not_configured', 'Vehicle market values need a VinAudit API key (VINAUDIT_API_KEY). See the Setup page.');
    }

    const cacheKey = JSON.stringify([key, q.vin || null, q.vin ? null : [q.year, q.make?.toLowerCase(), q.model?.toLowerCase(), q.trim?.toLowerCase()], q.mileage ?? 'avg', q.condition ?? '', q.titleStatus ?? '']);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const trim = q.vin ? null : await resolveTrim(q, key);
    const params = new URLSearchParams({ key, format: 'json', period: '90', country: 'usa' });
    if (q.vin) params.set('vin', q.vin);
    else params.set('id', trim!.id);
    params.set('mileage', q.mileage != null ? String(q.mileage) : 'average');
    if (q.condition) params.set('condition', CONDITION[q.condition]);
    const damage = q.titleStatus ? TITLE_DAMAGE[q.titleStatus] : undefined;
    if (damage) params.set('known_damage', damage);

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
    if (trim) notes.unshift(trim.assumed
        ? `Rough estimate using the ${trim.name} reference trim because no trim was entered. Other trims can have different values. Select your trim or add a VIN to refine it.`
        : `Estimated from year, make, model, and ${trim.name} trim, without a VIN. Individual vehicle history is not included.`);
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
        notes,
        ...(trim ? { trimSelection: { name: trim.name, assumed: trim.assumed, options: trim.options } } : {})
    };
    if (!result.retail && !result.tradeIn) throw new HttpError(404, 'no_data', 'VinAudit returned no usable market value for this vehicle.');
    cache.set(cacheKey, result);
    return result;
}
