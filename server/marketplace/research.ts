import type { AssetRecord } from '../../shared/schemas.js';
import { comparableAskingRange, marketQuery, sellingPlatforms, type MarketLocation, type MarketResearch } from '../../shared/marketplace.js';
import { ebayComparables, ebayConfigured } from './ebay.js';

export async function researchAsset(asset: AssetRecord, location: MarketLocation | null): Promise<MarketResearch> {
    const base: MarketResearch = { researchedAt: new Date().toISOString(), query: marketQuery(asset), location,
        providerStatus: 'needs_connection', message: 'Live comparable listings need an eBay connection. Use the platform links to research prices directly.',
        listings: [], askingRange: null, platforms: sellingPlatforms(asset, location) };
    if (asset.category === 'property' || asset.category === 'vehicle') return { ...base, providerStatus: 'unsupported', message: 'Start with the location-aware platform searches below. Automated listing comparisons for homes and vehicles are not connected yet; their values depend on property or vehicle-specific details.' };
    if (asset.currency !== 'USD' || (location && location.country !== 'US')) return { ...base, providerStatus: 'unsupported', message: 'Live comparable pricing currently supports US listings in USD. Use the platform searches to research your local market.' };
    if (!ebayConfigured()) return base;
    try {
        const listings = await ebayComparables(asset,location);
        const askingRange = comparableAskingRange(listings);
        return { ...base, providerStatus: 'ready', listings, askingRange,
            message: askingRange ? 'Suggested listing range from relevant active asking prices. These are not confirmed sales or guaranteed proceeds.' : 'Fewer than three relevant comparable listings. Review the evidence and refine the model or variant before choosing a price.' };
    } catch (err) {
        return { ...base, providerStatus: 'unavailable', message: err instanceof Error ? err.message : 'Price research is temporarily unavailable.' };
    }
}
