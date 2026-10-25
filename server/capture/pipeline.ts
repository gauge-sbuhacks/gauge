import type { CategoryId, Details } from '../../shared/categories.js';
import type { IdentifiedItem, SuggestedValue } from '../../shared/capture.js';
import type { AssetRecord, Condition, LookupSuggestion } from '../../shared/schemas.js';
import { cleanDetails } from '../routes/assets.js';
import { lookupCardPrices } from '../lookups/cards.js';
import { lookupMetalValue } from '../lookups/metals.js';
import { decodeVin } from '../lookups/nhtsa.js';
import { lookupVehicleValue, vinauditConfigured } from '../lookups/vinaudit.js';
import { ebayConfigured } from '../marketplace/ebay.js';
import { researchAsset } from '../marketplace/research.js';

export interface Enrichment {
    category: CategoryId | null;
    name: string | null;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
    condition: Condition | null;
    details: Details;
    lookupStatus: 'ready' | 'skipped' | 'error';
    lookupMessage: string | null;
    suggestedValue: SuggestedValue | null;
}

export interface LookupDeps {
    decodeVin: typeof decodeVin;
    vehicleValue: typeof lookupVehicleValue;
    cards: typeof lookupCardPrices;
    metal: typeof lookupMetalValue;
    research: typeof researchAsset;
    vinauditConfigured: () => boolean;
    ebayConfigured: () => boolean;
}

const defaultDeps: LookupDeps = {
    decodeVin,
    vehicleValue: lookupVehicleValue,
    cards: lookupCardPrices,
    metal: lookupMetalValue,
    research: researchAsset,
    vinauditConfigured,
    ebayConfigured
};

function applySuggestion(item: IdentifiedItem, suggestion: LookupSuggestion) {
    if (suggestion.field === 'brand') item.brand = String(suggestion.value);
    else if (suggestion.field === 'model') item.model = String(suggestion.value);
    else if (suggestion.field.startsWith('details.')) item.details[suggestion.field.slice('details.'.length)] = suggestion.value;
}

function safeDetails(category: CategoryId, raw: Details): Details {
    try {
        return cleanDetails(category, raw);
    } catch {
        return {};
    }
}

function blankAsset(item: IdentifiedItem, category: CategoryId): AssetRecord {
    const now = new Date().toISOString();
    return {
        id: '0'.repeat(24),
        name: item.name || 'Untitled item',
        category,
        brand: item.brand,
        model: item.model,
        location: null,
        condition: item.condition,
        purchaseDate: null,
        purchasePriceCents: null,
        currency: 'USD',
        serialNumber: item.serialNumber,
        notes: null,
        details: safeDetails(category, item.details),
        isSample: false,
        createdAt: now,
        updatedAt: now
    };
}

function vinOf(item: IdentifiedItem): string {
    const raw = item.details.vin ?? item.serialNumber ?? '';
    return String(raw).trim().toUpperCase();
}

export async function enrichIdentification(input: IdentifiedItem, deps: LookupDeps = defaultDeps): Promise<Enrichment> {
    const item: IdentifiedItem = { ...input, details: { ...input.details } };
    if (typeof item.details.mileage === 'number') item.details.mileage = Math.round(item.details.mileage);
    if (typeof item.details.year === 'number') item.details.year = Math.round(item.details.year);
    const category = item.category;
    const base = (): Enrichment => ({
        category,
        name: item.name,
        brand: item.brand,
        model: item.model,
        serialNumber: item.serialNumber,
        condition: item.condition,
        details: category ? safeDetails(category, item.details) : {},
        lookupStatus: 'skipped',
        lookupMessage: null,
        suggestedValue: null
    });

    try {
        if (!category || category === 'property') {
            return { ...base(), lookupMessage: category === 'property' ? 'Homes need an address before a value. Add it after you confirm.' : 'Could not tell what this is. Confirm and fill in the details.' };
        }

        if (category === 'vehicle') {
            const vin = vinOf(item);
            if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
                return { ...base(), lookupMessage: 'Needs a 17-character VIN before a market value. You can add it after confirming.' };
            }
            const decoded = await deps.decodeVin(vin);
            for (const suggestion of decoded.suggestions) applySuggestion(item, suggestion);
            item.serialNumber = vin;
            let message = 'Decoded the VIN.';
            let suggested: SuggestedValue | null = null;
            if (deps.vinauditConfigured()) {
                const mileage = typeof item.details.mileage === 'number' ? Math.round(item.details.mileage) : null;
                const value = await deps.vehicleValue({ vin, mileage, condition: item.condition, titleStatus: typeof item.details.titleStatus === 'string' ? item.details.titleStatus : null });
                if (value.retail) {
                    suggested = {
                        amountCents: value.retail.valueCents,
                        lowCents: value.retail.lowCents,
                        highCents: value.retail.highCents,
                        sourceName: 'VinAudit retail',
                        notes: `Suggested from the photo VIN${mileage != null ? ` at ${mileage.toLocaleString('en-US')} miles` : ''}. Confirm before it is saved.`
                    };
                    message = 'Decoded the VIN and looked up a retail value.';
                } else message = 'Decoded the VIN. VinAudit had no retail value.';
            } else message = 'Decoded the VIN. A market value needs a VinAudit key.';
            return { ...base(), name: item.name || valueName(item), brand: item.brand, model: item.model, serialNumber: item.serialNumber, details: safeDetails(category, item.details), lookupStatus: 'ready', lookupMessage: message, suggestedValue: suggested };
        }

        if (category === 'collectible' && item.details.kind === 'trading_card' && item.name) {
            const game = /magic|mtg|gathering/i.test(`${item.name} ${item.details.setName ?? ''} ${item.details.game ?? ''}`) ? 'magic' : 'pokemon';
            const prices = await deps.cards({
                game,
                name: item.name,
                setName: typeof item.details.setName === 'string' ? item.details.setName : null,
                number: typeof item.details.cardNumber === 'string' ? item.details.cardNumber : null
            });
            const match = prices.matches[0];
            const price = match?.prices.find((p) => p.currency === 'USD' && p.marketCents != null);
            return {
                ...base(),
                lookupStatus: price?.marketCents != null ? 'ready' : 'skipped',
                lookupMessage: price?.marketCents != null ? `Market price from ${prices.providerLabel}.` : 'No card price matched.',
                suggestedValue:
                    price?.marketCents != null
                        ? { amountCents: price.marketCents, lowCents: price.lowCents, highCents: price.highCents, sourceName: prices.providerLabel, notes: 'Suggested from the card name on the photo. Confirm before it is saved.' }
                        : null
            };
        }

        if (category === 'jewelry') {
            const metal = item.details.metal;
            const weight = typeof item.details.weightGrams === 'number' ? item.details.weightGrams : null;
            const purity = typeof item.details.purity === 'string' ? item.details.purity : null;
            if (metal === 'gold' || metal === 'silver' || metal === 'platinum' || metal === 'palladium') {
                if (weight != null && weight > 0 && purity) {
                    const melt = await deps.metal({ metal, weightGrams: weight, purity });
                    return {
                        ...base(),
                        lookupStatus: 'ready',
                        lookupMessage: 'Melt value from the live spot price.',
                        suggestedValue: {
                            amountCents: melt.meltValueCents,
                            lowCents: null,
                            highCents: null,
                            sourceName: melt.providerLabel,
                            notes: 'Metal value only. Confirm before it is saved.'
                        }
                    };
                }
            }
        }

        if (!deps.ebayConfigured()) {
            return { ...base(), lookupMessage: 'No price source for this item yet. Active asking prices need an eBay connection.' };
        }
        const report = await deps.research(blankAsset(item, category), null);
        const range = report.askingRange;
        return {
            ...base(),
            lookupStatus: range ? 'ready' : 'skipped',
            lookupMessage: range ? 'Asking-price range from similar listings.' : report.message,
            suggestedValue: range
                ? {
                      amountCents: range.medianCents,
                      lowCents: range.lowCents,
                      highCents: range.highCents,
                      sourceName: 'eBay active asking prices',
                      notes: `Suggested from ${range.count} listings. Asking prices, not completed sales.`
                  }
                : null
        };
    } catch (err) {
        return { ...base(), lookupStatus: 'error', lookupMessage: err instanceof Error ? err.message : 'Price lookup failed.' };
    }
}

function valueName(item: IdentifiedItem): string | null {
    const parts = [item.brand, item.model].filter(Boolean);
    return parts.length ? parts.join(' ') : item.name;
}
