import type { AssetRecord } from '../../shared/schemas.js';
import { marketQuery, matchListing, type ComparableListing, type MarketLocation } from '../../shared/marketplace.js';

let token: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;
export function ebayConfigured(): boolean {
    return !!(process.env.EBAY_CLIENT_ID?.trim() && process.env.EBAY_CLIENT_SECRET?.trim());
}

async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now()) return token.value;
    if (pendingToken) return pendingToken;
    pendingToken = (async () => {
        const credentials = Buffer.from(`${process.env.EBAY_CLIENT_ID?.trim()}:${process.env.EBAY_CLIENT_SECRET?.trim()}`).toString('base64');
        const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
            method: 'POST', headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
            signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) throw new Error('eBay could not authorize this connection. Check its production credentials and API access.');
        const body = await res.json() as { access_token?: string; expires_in?: number };
        if (!body.access_token) throw new Error('eBay returned no access token.');
        token = { value: body.access_token, expiresAt: Date.now() + Math.max(0,(body.expires_in ?? 300)-60)*1000 };
        return token.value;
    })();
    try { return await pendingToken; } finally { pendingToken = null; }
}

interface EbayItem {
    itemId?: string; title?: string; price?: { value?: string; currency?: string };
    itemWebUrl?: string; condition?: string; image?: { imageUrl?: string };
    itemLocation?: { city?: string; stateOrProvince?: string; country?: string };
    shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
}

export async function ebayComparables(asset: AssetRecord, location: MarketLocation | null): Promise<ComparableListing[]> {
    const bearer = await accessToken();
    const params = new URLSearchParams({ q: marketQuery(asset), limit: '50', filter: 'buyingOptions:{FIXED_PRICE},priceCurrency:USD,itemLocationCountry:US' });
    const headers: Record<string,string> = { authorization: `Bearer ${bearer}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', accept: 'application/json' };
    if (location?.country === 'US') headers['X-EBAY-C-ENDUSERCTX'] = `contextualLocation=${encodeURIComponent(`country=US,zip=${location.postalCode}`)}`;
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, { headers, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
        if (res.status === 401) token = null;
        throw new Error(res.status === 429 ? 'eBay is limiting requests. Try again later.' : 'eBay search is unavailable. You can still compare listings directly.');
    }
    const body = await res.json() as { itemSummaries?: EbayItem[] };
    const unique = new Set<string>();
    const listings: ComparableListing[] = [];
    for (const row of body.itemSummaries ?? []) {
        if (!row.itemId || unique.has(row.itemId) || !row.title || row.price?.currency !== 'USD' || !row.itemWebUrl) continue;
        let url: URL;
        try { url = new URL(row.itemWebUrl); } catch { continue; }
        if (url.protocol !== 'https:' || !(url.hostname === 'ebay.com' || url.hostname.endsWith('.ebay.com'))) continue;
        const priceCents = Math.round(Number(row.price.value)*100);
        if (!Number.isSafeInteger(priceCents) || priceCents <= 0) continue;
        const match = matchListing(asset,row.title,row.condition ?? null);
        if (!match) continue;
        unique.add(row.itemId);
        const shipping = row.shippingOptions?.[0]?.shippingCost;
        const shippingCents = shipping?.currency === 'USD' && Number.isFinite(Number(shipping.value)) ? Math.round(Number(shipping.value)*100) : null;
        listings.push({ id: row.itemId, title: row.title, priceCents, currency: 'USD', url: url.href,
            imageUrl: row.image?.imageUrl?.startsWith('https://') ? row.image.imageUrl : null,
            condition: row.condition ?? null, location: [row.itemLocation?.city,row.itemLocation?.stateOrProvince,row.itemLocation?.country].filter(Boolean).join(', ') || null,
            shippingCents, platform: 'ebay', matchScore: match.score, matchReasons: match.reasons });
    }
    return listings.sort((a,b) => b.matchScore-a.matchScore).slice(0,20);
}
