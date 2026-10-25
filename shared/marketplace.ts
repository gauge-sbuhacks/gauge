import { z } from 'zod';
import type { AssetRecord } from './schemas.js';

export const marketLocationSchema = z.object({
    city: z.string().trim().min(1, 'Enter your city').max(100),
    region: z.string().trim().min(1, 'Enter your state or region').max(100),
    postalCode: z.string().trim().min(1, 'Enter your postal code').max(16),
    country: z.string().trim().length(2, 'Use a two-letter country code').transform(s => s.toUpperCase())
}).superRefine((v, ctx) => {
    if (v.country === 'US' && !/^\d{5}(-\d{4})?$/.test(v.postalCode)) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a valid US ZIP code' });
    if (!/^[A-Z]{2}$/.test(v.country)) ctx.addIssue({ code: 'custom', path: ['country'], message: 'Use a two-letter country code' });
});
export type MarketLocation = z.infer<typeof marketLocationSchema>;
export type PlatformId = 'ebay' | 'facebook' | 'zillow' | 'cars';
export interface SellingPlatform {
    id: PlatformId; name: string; reason: string; searchUrl: string; sellUrl: string;
}
export interface ComparableListing {
    id: string; title: string; priceCents: number; currency: 'USD'; url: string;
    imageUrl: string | null; condition: string | null; location: string | null;
    platform: 'ebay'; matchScore: number; matchReasons: string[]; shippingCents: number | null;
}
export interface MarketResearch {
    researchedAt: string; query: string; location: MarketLocation | null;
    providerStatus: 'ready' | 'needs_connection' | 'unavailable' | 'unsupported';
    message: string; listings: ComparableListing[];
    askingRange: { lowCents: number; medianCents: number; highCents: number; count: number } | null;
    platforms: SellingPlatform[];
}

export function marketQuery(asset: AssetRecord): string {
    const d = asset.details;
    const parts = [asset.brand, asset.model, d.referenceNumber, d.setName, d.cardNumber, d.year];
    const words = parts.filter(v => typeof v === 'string' || typeof v === 'number').map(String).filter(Boolean);
    return [...new Set(words.length ? words : [asset.name])].join(' ').slice(0, 180);
}

export function sellingPlatforms(asset: AssetRecord, location: MarketLocation | null): SellingPlatform[] {
    const query = marketQuery(asset);
    const localQuery = [query, location?.city, location?.region].filter(Boolean).join(' ');
    const ebay: SellingPlatform = { id: 'ebay', name: 'eBay', reason: 'Reach buyers for shippable items and collectibles.', searchUrl: `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: query, LH_BIN: '1', ...(location?.country === 'US' ? { _stpos: location.postalCode } : {}) })}`, sellUrl: 'https://www.ebay.com/sl/sell' };
    const facebook: SellingPlatform = { id: 'facebook', name: 'Facebook Marketplace', reason: 'Explore local buyers and arrange pickup. Confirm your area on Facebook.', searchUrl: `https://www.facebook.com/marketplace/search/?${new URLSearchParams({ query: localQuery })}`, sellUrl: 'https://www.facebook.com/marketplace/create/item' };
    if (asset.category === 'property') {
        const place = [asset.details.city, asset.details.state, asset.details.postalCode].filter(Boolean).join(' ') || [location?.city, location?.region, location?.postalCode].filter(Boolean).join(' ');
        return [{ id: 'zillow', name: 'Zillow', reason: 'Explore nearby homes and home-selling options.', searchUrl: `https://www.zillow.com/homes/${encodeURIComponent(place)}/`, sellUrl: 'https://www.zillow.com/sell/' }];
    }
    if (asset.category === 'vehicle') return [
        { id: 'cars', name: 'Cars.com', reason: 'Compare vehicles and explore selling options.', searchUrl: `https://www.cars.com/shopping/results/?${new URLSearchParams({ keyword: query, ...(location?.country === 'US' ? { zip: location.postalCode } : {}) })}`, sellUrl: 'https://www.cars.com/sell/' }, facebook
    ];
    return asset.category === 'household' || asset.category === 'equipment' ? [facebook, ebay] : [ebay, facebook];
}

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
export function matchListing(asset: AssetRecord, title: string, condition: string | null): { score: number; reasons: string[] } | null {
    const titleTokens = new Set(tokens(title));
    const has = (s: string) => tokens(s).every(t => titleTokens.has(t));
    const assetText = `${asset.name} ${asset.model ?? ''}`.toLowerCase();
    if (/\b(for parts|not working|broken|repair only|empty box|box only|case only|manual only|replica|reproduction)\b/i.test(title) && !/\b(broken|repair|parts|replica)\b/.test(assetText)) return null;
    if (/\b(case|cover|charger|screen protector|strap|watch band)\s+(for|compatible with)\b/i.test(title)) return null;
    if (/\b(lot of|bundle|pack of|set of)\b/i.test(title) && !/\b(lot|bundle|pack|set)\b/.test(assetText)) return null;
    if (asset.category === 'electronics' && /\b(case|cover|charger|screen protector)\b/i.test(title) && !/\b(case|cover|charger|screen protector)\b/i.test(assetText)) return null;
    if (asset.category === 'electronics') {
        const itemTokens = new Set(tokens(assetText));
        if (['pro', 'max', 'mini', 'ultra', 'plus'].some(t => titleTokens.has(t) && !itemTokens.has(t))) return null;
        const capacities = String(asset.details.specs ?? '').toLowerCase().match(/\d+\s*(?:gb|tb)\b/g) ?? [];
        const compactTitle = title.toLowerCase().replace(/\s+/g, '');
        if (capacities.some(c => !compactTitle.includes(c.replace(/\s+/g, '')))) return null;
    }
    const identity = String(asset.details.referenceNumber || asset.model || asset.name);
    const identityTokens = tokens(identity).filter(t => t.length > 1);
    if (!identityTokens.length) return null;
    const hits = identityTokens.filter(t => titleTokens.has(t)).length;
    if (hits / identityTokens.length < 0.8) return null;
    if (asset.brand && !has(asset.brand)) return null;
    const reasons = [hits === identityTokens.length ? 'Model/title matched' : 'Most model terms matched'];
    let score = hits / identityTokens.length * 0.65;
    if (asset.brand && has(asset.brand)) { score += 0.15; reasons.push('Brand matched'); }
    for (const key of ['referenceNumber', 'cardNumber', 'setName', 'year', 'grader', 'grade']) {
        const v = asset.details[key];
        if (v != null && String(v).trim()) {
            if (!has(String(v))) return null;
            reasons.push(`${key === 'year' ? 'Year' : 'Variant'} matched`); score += 0.05;
        }
    }
    const isNew = !!condition && /\bnew\b/i.test(condition) && !/\bpre|used/i.test(condition);
    if (asset.condition === 'new' && condition && !isNew) return null;
    if (asset.condition && asset.condition !== 'new' && isNew) return null;
    if (condition) { score += 0.05; reasons.push('Condition shown; verify details'); }
    return { score: Math.min(1, score), reasons };
}

export function comparableAskingRange(listings: ComparableListing[]): MarketResearch['askingRange'] {
    const prices = listings.filter(v => v.matchScore >= 0.65 && v.currency === 'USD' && v.priceCents > 0).map(v => v.priceCents).sort((a,b) => a-b);
    if (prices.length < 3) return null;
    const quantile = (xs: number[], q: number) => {
        const i=(xs.length-1)*q, lo=Math.floor(i), hi=Math.ceil(i);
        return Math.round(xs[lo]+(xs[hi]-xs[lo])*(i-lo));
    };
    const q1=quantile(prices,.25), q3=quantile(prices,.75), iqr=q3-q1;
    const kept=prices.filter(p => p >= q1-1.5*iqr && p <= q3+1.5*iqr);
    if (kept.length < 3) return null;
    return { lowCents: quantile(kept,.25), medianCents: quantile(kept,.5), highCents: quantile(kept,.75), count: kept.length };
}

export function listingDraft(asset: AssetRecord, priceCents: number | null): string {
    const details = Object.entries(asset.details).filter(([k,v]) => v != null && String(v).trim() && !/address|city|state|postal|vin|serial|certificate|certNumber/i.test(k)).map(([k,v]) => `${k.replace(/([A-Z])/g,' $1')}: ${v}`).slice(0,10);
    return [asset.name, [asset.brand,asset.model].filter(Boolean).join(' '), asset.condition ? `Condition: ${asset.condition}` : '', ...details, priceCents != null ? `Asking price: $${(priceCents/100).toFixed(2)} USD (review before posting)` : 'Asking price: add your price', 'Add photos and confirm item details before publishing.'].filter(Boolean).join('\n');
}
