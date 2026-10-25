// gold-api.com: live spot prices for gold, silver, platinum, and palladium. free, no key.
// melt value = spot price per troy ounce x weight in troy ounces x purity. it ignores dealer
// premiums, numismatic value, and craftsmanship, so it is a floor for jewelry, not a price.

import type { MetalValueQuery, MetalValueResult, SpotMetal } from '../../shared/schemas.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const SYMBOLS: Record<SpotMetal, string> = { gold: 'XAU', silver: 'XAG', platinum: 'XPT', palladium: 'XPD' };
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const providerLabel = 'gold-api.com';

interface Spot {
    centsPerOunce: number;
    updatedAt: string;
}

// spot moves all day, but a few minutes of staleness doesn't matter for a valuation
const spotCache = new TtlCache<Spot>(5 * 60 * 1000, 10);

// "22k (.9167)" -> 0.9167, "24k" -> 1, "925" -> 0.925, "999.9" -> 0.9999, "99.9%" -> 0.999, "sterling" -> 0.925
export function parsePurity(raw: string): number | null {
    const s = raw.trim().toLowerCase();
    if (s === '') return null;
    if (s.includes('sterling')) return 0.925;

    const inRange = (n: number) => (Number.isFinite(n) && n > 0 && n <= 1 ? Math.round(n * 100_000) / 100_000 : null);

    // an explicit fraction wins, since it is the most precise ("22k (.9167)")
    const fraction = /(?:^|[^\d])(0?\.\d+)/.exec(s);
    if (fraction) return inRange(Number(fraction[1]));

    const percent = /(\d+(?:\.\d+)?)\s*%/.exec(s);
    if (percent) return inRange(Number(percent[1]) / 100);

    const karat = /(\d{1,2}(?:\.\d+)?)\s*(?:k|kt|karat|carat)\b/.exec(s);
    if (karat) return inRange(Number(karat[1]) / 24);

    // millesimal fineness: 925, 999, 999.9, 1000. "9999" is the four-nines way of writing 999.9
    const fineness = /\d{3,4}(?:\.\d+)?/.exec(s);
    if (fineness) {
        const n = Number(fineness[0]);
        return inRange(n > 1000 ? n / 10_000 : n / 1000);
    }

    if (/^1(\.0*)?$/.test(s)) return 1;
    return null;
}

async function getSpot(metal: SpotMetal): Promise<Spot> {
    const cached = spotCache.get(metal);
    if (cached) return cached;

    let res: Response;
    try {
        res = await fetch(`https://api.gold-api.com/price/${SYMBOLS[metal]}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(10_000)
        });
    } catch {
        throw new HttpError(502, 'provider_unreachable', `${providerLabel} did not respond. Try again in a minute.`);
    }
    if (!res.ok) throw new HttpError(502, 'provider_error', `${providerLabel} returned an error (${res.status}).`);

    const data = (await res.json()) as { price?: unknown; currency?: unknown; updatedAt?: unknown };
    if (typeof data.price !== 'number' || !(data.price > 0) || data.currency !== 'USD') {
        throw new HttpError(502, 'provider_error', `${providerLabel} sent a price we couldn't read.`);
    }
    const spot: Spot = {
        centsPerOunce: Math.round(data.price * 100),
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
    };
    spotCache.set(metal, spot);
    return spot;
}

export async function lookupMetalValue(q: MetalValueQuery): Promise<MetalValueResult> {
    const purity = parsePurity(q.purity);
    if (purity == null) {
        const hint = 'Use a format like .9999, 22k, 925, or 99.9%';
        throw new HttpError(400, 'validation', `Couldn't read the purity "${q.purity}". ${hint}.`, { purity: hint });
    }

    const spot = await getSpot(q.metal);
    const fineOunces = (q.weightGrams / GRAMS_PER_TROY_OUNCE) * purity;

    const notes = [
        'Melt value of the metal alone, at the live spot price.',
        'Coins and bars usually sell a little above melt; jewelry is often worth more for its design, brand, or stones.'
    ];
    if (purity < 0.5) notes.push('Purity is under 50%. Double-check it, since it changes the value a lot.');

    return {
        provider: 'gold_api',
        providerLabel,
        fetchedAt: new Date().toISOString(),
        metal: q.metal,
        spotCentsPerOunce: spot.centsPerOunce,
        spotUpdatedAt: spot.updatedAt,
        weightGrams: q.weightGrams,
        purity,
        fineOunces,
        meltValueCents: Math.round(fineOunces * spot.centsPerOunce),
        notes
    };
}
