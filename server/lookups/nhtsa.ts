// nhtsa: free government apis, no key needed.
// vPIC decodes a vin into specs (no prices). the recalls api lists recalls for a make/model/year.

import type { LookupSuggestion, RecallItem, RecallLookupResult, VinLookupResult } from '../../shared/schemas.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const TIMEOUT_MS = 10_000;
const vinCache = new TtlCache<VinLookupResult>(12 * 60 * 60 * 1000);
const recallCache = new TtlCache<RecallLookupResult>(12 * 60 * 60 * 1000);

async function getJson(url: string, providerLabel: string): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
        throw new HttpError(502, 'provider_unreachable', `${providerLabel} did not respond. Try again in a minute.`);
    }
    if (!res.ok) throw new HttpError(502, 'provider_error', `${providerLabel} returned an error (${res.status}).`);
    return res.json();
}

// "CADILLAC" -> "Cadillac", but keep short all-caps like "BMW" and "GMC"
function titleCase(s: string): string {
    if (s.length <= 3) return s;
    return s
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase())
        // "(Usa)" -> "(USA)"
        .replace(/\(([a-z]{2,3})\)/gi, (_m, w: string) => `(${w.toUpperCase()})`);
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// ---------- vin decode ----------

export async function decodeVin(vinRaw: string): Promise<VinLookupResult> {
    const vin = vinRaw.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) {
        throw new HttpError(400, 'validation', 'Enter at least the first 11 characters of the VIN.', { vin: 'VINs use letters and numbers only (no I, O, or Q)' });
    }
    const cached = vinCache.get(vin);
    if (cached) return cached;

    const providerLabel = 'NHTSA vPIC';
    const data = (await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, providerLabel)) as {
        Results?: Record<string, unknown>[];
    };
    const r = data.Results?.[0] ?? {};

    const suggestions: LookupSuggestion[] = [];
    const make = clean(r.Make);
    const model = clean(r.Model);
    const year = Number.parseInt(clean(r.ModelYear), 10);
    const trim = clean(r.Trim) || clean(r.Series);

    if (make) suggestions.push({ field: 'brand', label: 'Make', value: titleCase(make), display: titleCase(make) });
    if (model) suggestions.push({ field: 'model', label: 'Model', value: model, display: model });
    if (Number.isFinite(year)) suggestions.push({ field: 'details.year', label: 'Year', value: year, display: String(year) });
    if (trim) suggestions.push({ field: 'details.trim', label: 'Trim', value: trim, display: trim });
    suggestions.push({ field: 'details.vin', label: 'VIN', value: vin, display: vin });

    const engineBits = [
        clean(r.DisplacementL) && `${Number(clean(r.DisplacementL)).toFixed(1)}L`,
        clean(r.EngineCylinders) && `${clean(r.EngineCylinders)}-cylinder`,
        clean(r.EngineHP) && `${Math.round(Number(clean(r.EngineHP)))} hp`
    ].filter(Boolean);

    const specs = [
        { label: 'Body', value: clean(r.BodyClass) },
        { label: 'Drive', value: clean(r.DriveType) },
        { label: 'Engine', value: engineBits.join(', ') },
        { label: 'Fuel', value: clean(r.FuelTypePrimary) },
        { label: 'Seats', value: clean(r.Seats) },
        { label: 'Built in', value: [clean(r.PlantCity), clean(r.PlantCountry)].filter(Boolean).map(titleCase).join(', ') },
        { label: 'Manufacturer', value: clean(r.Manufacturer) }
    ].filter((s) => s.value !== '');

    // vPIC reports problems as ErrorCode "0" (fine) or a list like "1,14" with readable ErrorText
    const warnings: string[] = [];
    const codes = clean(r.ErrorCode).split(',').map((c) => c.trim());
    if (codes.some((c) => c !== '' && c !== '0')) {
        const text = clean(r.ErrorText);
        // "6 - Incomplete VIN; 1 - Check digit..." -> ["Incomplete VIN", "Check digit..."]
        if (text) warnings.push(...text.split(';').map((t) => t.trim().replace(/^\d+\s*-\s*/, '')).filter(Boolean));
    }
    if (!make && !model) warnings.push('NHTSA could not match this VIN. Double-check it, or enter the details by hand.');

    const result: VinLookupResult = {
        provider: 'nhtsa_vpic',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        vin,
        suggestions,
        specs,
        warnings
    };
    vinCache.set(vin, result);
    return result;
}

// ---------- recalls ----------

// "15/10/2020" -> "2020-10-15"
function parseNhtsaDate(s: string): string | null {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function lookupRecalls(makeRaw: string, modelRaw: string, year: number): Promise<RecallLookupResult> {
    const make = makeRaw.trim();
    const model = modelRaw.trim();
    const key = `${make}|${model}|${year}`.toLowerCase();
    const cached = recallCache.get(key);
    if (cached) return cached;

    const providerLabel = 'NHTSA Recalls';
    const params = new URLSearchParams({ make, model, modelYear: String(year) });
    const data = (await getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?${params}`, providerLabel)) as {
        results?: Record<string, unknown>[];
    };

    const recalls: RecallItem[] = (data.results ?? []).map((r) => {
        const campaignNumber = clean(r.NHTSACampaignNumber);
        return {
            campaignNumber,
            reportedAt: parseNhtsaDate(clean(r.ReportReceivedDate)),
            component: clean(r.Component),
            summary: clean(r.Summary),
            consequence: clean(r.Consequence),
            remedy: clean(r.Remedy),
            parkIt: r.parkIt === true,
            parkOutside: r.parkOutSide === true,
            overTheAir: r.overTheAirUpdate === true,
            url: `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(campaignNumber)}`
        };
    });
    // newest first
    recalls.sort((a, b) => (b.reportedAt ?? '').localeCompare(a.reportedAt ?? ''));

    const result: RecallLookupResult = {
        provider: 'nhtsa_recalls',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        query: { make, model, year },
        recalls
    };
    recallCache.set(key, result);
    return result;
}
