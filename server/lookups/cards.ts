// trading card prices. both free, no key:
//   - pokémon: TCGdex (api.tcgdex.net). the Pokémon TCG API from the requirements doc was returning
//     500s for single cards when tested, and TCGdex carries the same TCGplayer prices per printing
//   - magic: Scryfall (api.scryfall.com). it asks for a User-Agent and an Accept header on every call
// prices are for ungraded copies and update about once a day, so results are cached for 6 hours.

import type { CardMatch, CardPrice, CardPriceQuery, CardPriceResult } from '../../shared/schemas.js';
import { HttpError } from '../errors.js';
import { TtlCache } from './cache.js';

const MAX_MATCHES = 6;
const cache = new TtlCache<CardPriceResult>(6 * 60 * 60 * 1000, 300);

const toCents = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

async function getJson(url: string, providerLabel: string, headers: Record<string, string> = {}): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12_000) });
    } catch {
        throw new HttpError(502, 'provider_unreachable', `${providerLabel} did not respond. Try again in a minute.`);
    }
    if (res.status === 404) return null;
    if (res.status === 429) throw new HttpError(429, 'provider_quota', `${providerLabel} is rate limiting us. Wait a minute and try again.`);
    if (!res.ok) throw new HttpError(502, 'provider_error', `${providerLabel} returned an error (${res.status}).`);
    return res.json();
}

// "4/102" -> "4", "004" -> "4", "TG05" -> "tg05"
function normalizeNumber(n: string | null | undefined): string {
    const first = (n ?? '').trim().split('/')[0].toLowerCase();
    return first.replace(/^0+(?=\w)/, '');
}

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface Ranked {
    match: CardMatch;
    score: number;
}

// number matches matter most (one card per number in a set), then the set name
function rank(match: CardMatch, q: CardPriceQuery): Ranked {
    const wantNumber = normalizeNumber(q.number);
    const wantSet = str(q.setName);
    const numberHit = wantNumber !== '' && normalizeNumber(match.number) === wantNumber;
    const setExact = wantSet !== '' && sameText(match.setName, wantSet);
    const setPartial = wantSet !== '' && match.setName.toLowerCase().includes(wantSet.toLowerCase());
    const score = (numberHit ? 4 : 0) + (setExact ? 2 : setPartial ? 1 : 0) + (match.prices.length > 0 ? 0.5 : 0);
    return { match: { ...match, exact: numberHit && (setExact || wantSet === '') }, score };
}

function finish(provider: CardPriceResult['provider'], providerLabel: string, q: CardPriceQuery, matches: CardMatch[], notes: string[]): CardPriceResult {
    const ranked = matches
        .map((m) => rank(m, q))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_MATCHES)
        .map((r) => r.match);
    return { provider, providerLabel, fetchedAt: new Date().toISOString(), game: q.game, matches: ranked, notes };
}

// ---------- pokémon (TCGdex) ----------

const TCGDEX = 'https://api.tcgdex.net/v2/en';

// "1st-edition-holofoil" -> "1st Edition holofoil", "reverse-holofoil" -> "Reverse holofoil"
function printingLabel(key: string): string {
    const words = key.split('-').join(' ');
    const label = words.charAt(0).toUpperCase() + words.slice(1);
    return label.replace(/^1st edition/i, '1st Edition');
}

function tcgdexPrices(pricing: Record<string, unknown> | undefined): { prices: CardPrice[]; productId: number | null } {
    const prices: CardPrice[] = [];
    let productId: number | null = null;

    const tcgplayer = (pricing?.tcgplayer ?? null) as Record<string, unknown> | null;
    if (tcgplayer) {
        for (const [key, value] of Object.entries(tcgplayer)) {
            if (!value || typeof value !== 'object') continue;
            const v = value as Record<string, unknown>;
            const market = toCents(v.marketPrice) ?? toCents(v.midPrice);
            if (market == null) continue;
            if (productId == null && typeof v.productId === 'number') productId = v.productId;
            prices.push({ label: printingLabel(key), currency: 'USD', marketCents: market, lowCents: toCents(v.lowPrice), highCents: toCents(v.highPrice), source: 'TCGplayer' });
        }
    }

    // only fall back to the european market when there is no us price at all
    const cardmarket = (pricing?.cardmarket ?? null) as Record<string, unknown> | null;
    if (prices.length === 0 && cardmarket && cardmarket.unit === 'EUR') {
        const trend = toCents(cardmarket.trend) ?? toCents(cardmarket.avg30);
        if (trend != null) prices.push({ label: 'Trend', currency: 'EUR', marketCents: trend, lowCents: toCents(cardmarket.low), highCents: null, source: 'Cardmarket' });
    }
    return { prices, productId };
}

async function pokemonPrices(q: CardPriceQuery): Promise<CardPriceResult> {
    const providerLabel = 'TCGdex';
    const search = async (withSet: boolean) => {
        const params = new URLSearchParams({ name: q.name, 'pagination:itemsPerPage': '100' });
        if (withSet && q.setName) params.set('set.name', `like:${q.setName}`);
        const list = (await getJson(`${TCGDEX}/cards?${params}`, providerLabel)) as { id: string; localId: string }[] | null;
        return Array.isArray(list) ? list : [];
    };

    let brief = await search(Boolean(q.setName));
    // a set name typed slightly differently ("Base" vs "Base Set") shouldn't hide the card
    if (brief.length === 0 && q.setName) brief = await search(false);
    if (brief.length === 0) throw new HttpError(404, 'no_match', `TCGdex has no Pokémon card named "${q.name}". Check the spelling, or try just the Pokémon's name.`);

    // the brief list has no set names, so use the card number to pick which ones to open
    const wantNumber = normalizeNumber(q.number);
    const picked = [...brief].sort((a, b) => Number(normalizeNumber(b.localId) === wantNumber) - Number(normalizeNumber(a.localId) === wantNumber)).slice(0, MAX_MATCHES + 2);

    const cards = await Promise.allSettled(picked.map((c) => getJson(`${TCGDEX}/cards/${encodeURIComponent(c.id)}`, providerLabel)));
    const matches: CardMatch[] = [];
    for (const r of cards) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        const c = r.value as Record<string, unknown>;
        const set = (c.set ?? {}) as Record<string, unknown>;
        const { prices, productId } = tcgdexPrices(c.pricing as Record<string, unknown> | undefined);
        matches.push({
            id: str(c.id),
            name: str(c.name),
            setName: str(set.name),
            number: str(c.localId),
            rarity: str(c.rarity) || null,
            imageUrl: str(c.image) ? `${str(c.image)}/low.webp` : null,
            url: productId != null ? `https://www.tcgplayer.com/product/${productId}` : null,
            exact: false,
            prices
        });
    }
    if (matches.length === 0) throw new HttpError(502, 'provider_error', 'TCGdex found the card but would not return its details. Try again in a minute.');

    return finish('tcgdex', providerLabel, q, matches, [
        'TCGplayer market prices for ungraded copies, updated about once a day.',
        'Each printing (holofoil, reverse holofoil, 1st Edition) has its own price. Pick the one that matches your card.'
    ]);
}

// ---------- magic (Scryfall) ----------

const SCRYFALL = 'https://api.scryfall.com';
const SCRYFALL_HEADERS = { 'user-agent': 'Gauge/0.1 (asset inventory, SBU Hacks)' };

async function magicPrices(q: CardPriceQuery): Promise<CardPriceResult> {
    const providerLabel = 'Scryfall';

    // fuzzy match first, so "black lotus" or "lightning bolt" finds the exact card name
    const named = (await getJson(`${SCRYFALL}/cards/named?${new URLSearchParams({ fuzzy: q.name })}`, providerLabel, SCRYFALL_HEADERS)) as Record<string, unknown> | null;
    if (!named || named.object !== 'card') {
        throw new HttpError(404, 'no_match', `Scryfall has no Magic card named "${q.name}". Check the spelling.`);
    }

    const params = new URLSearchParams({ q: `!"${str(named.name)}"`, unique: 'prints', order: 'released' });
    const prints = (await getJson(`${SCRYFALL}/cards/search?${params}`, providerLabel, SCRYFALL_HEADERS)) as { data?: Record<string, unknown>[] } | null;

    const matches: CardMatch[] = (prints?.data ?? [named]).map((c) => {
        const p = (c.prices ?? {}) as Record<string, unknown>;
        const prices: CardPrice[] = [];
        const add = (label: string, value: unknown, currency: 'USD' | 'EUR', source: string) => {
            const cents = toCents(typeof value === 'string' ? Number(value) : value);
            if (cents != null) prices.push({ label, currency, marketCents: cents, lowCents: null, highCents: null, source });
        };
        add('Nonfoil', p.usd, 'USD', 'TCGplayer');
        add('Foil', p.usd_foil, 'USD', 'TCGplayer');
        add('Etched foil', p.usd_etched, 'USD', 'TCGplayer');
        if (prices.length === 0) add('Trend', p.eur, 'EUR', 'Cardmarket');

        const images = (c.image_uris ?? (Array.isArray(c.card_faces) ? (c.card_faces[0] as Record<string, unknown>)?.image_uris : null)) as Record<string, unknown> | null;
        return {
            id: str(c.id),
            name: str(c.name),
            setName: str(c.set_name),
            number: str(c.collector_number),
            rarity: str(c.rarity) || null,
            imageUrl: str(images?.small) || null,
            url: str(c.scryfall_uri) || null,
            exact: false,
            prices
        };
    });

    return finish('scryfall', providerLabel, q, matches, ['TCGplayer market prices for ungraded copies, updated about once a day.']);
}

// ---------- entry ----------

export async function lookupCardPrices(q: CardPriceQuery): Promise<CardPriceResult> {
    const key = [q.game, q.name, q.setName ?? '', normalizeNumber(q.number)].join('|').toLowerCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const result = q.game === 'pokemon' ? await pokemonPrices(q) : await magicPrices(q);
    cache.set(key, result);
    return result;
}
