import type { CategoryId, Details } from '../../shared/categories.js';
import type { IdentifiedItem, SuggestedValue } from '../../shared/capture.js';
import { PRICE_CHECK_SOURCE, type AssetRecord, type Condition, type LookupSuggestion } from '../../shared/schemas.js';
import { estimatePrices, type PriceGuess } from './estimate.js';
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
    quickSale: SuggestedValue | null;
}

export interface LookupDeps {
    decodeVin: typeof decodeVin;
    vehicleValue: typeof lookupVehicleValue;
    cards: typeof lookupCardPrices;
    metal: typeof lookupMetalValue;
    research: typeof researchAsset;
    estimatePrices: (item: IdentifiedItem) => Promise<PriceGuess | null>;
    vinauditConfigured: () => boolean;
    ebayConfigured: () => boolean;
}

const defaultDeps: LookupDeps = {
    decodeVin,
    vehicleValue: lookupVehicleValue,
    cards: lookupCardPrices,
    metal: lookupMetalValue,
    research: researchAsset,
    estimatePrices,
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
        suggestedValue: null,
        quickSale: null
    });

    try {
        if (!category || category === 'property') {
            return { ...base(), lookupMessage: category === 'property' ? 'Homes need an address before a value. Add it after you confirm.' : 'Could not tell what this is. Confirm and fill in the details.' };
        }

        if (category === 'vehicle') {
            const vin = vinOf(item);
            if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
                return finish(item, deps, { ...base(), lookupMessage: 'No 17-character VIN, so there is no VinAudit price yet.' });
            }
            const decoded = await deps.decodeVin(vin);
            for (const suggestion of decoded.suggestions) applySuggestion(item, suggestion);
            item.serialNumber = vin;
            let message = 'Decoded the VIN.';
            let suggested: SuggestedValue | null = null;
            let quick: SuggestedValue | null = null;
            if (deps.vinauditConfigured()) {
                const mileage = typeof item.details.mileage === 'number' ? Math.round(item.details.mileage) : null;
                const value = await deps.vehicleValue({ vin, mileage, condition: item.condition, titleStatus: typeof item.details.titleStatus === 'string' ? item.details.titleStatus : null });
                const note = `From the photo VIN${mileage != null ? ` at ${mileage.toLocaleString('en-US')} miles` : ''}. Confirm before it is saved.`;
                if (value.retail) {
                    suggested = { amountCents: value.retail.valueCents, lowCents: value.retail.lowCents, highCents: value.retail.highCents, sourceName: 'VinAudit retail', notes: note };
                }
                if (value.tradeIn) {
                    quick = { amountCents: value.tradeIn.valueCents, lowCents: value.tradeIn.lowCents, highCents: value.tradeIn.highCents, sourceName: 'VinAudit trade-in', notes: 'What a dealer would offer. Confirm before it is saved.' };
                }
                message = suggested ? 'Decoded the VIN and looked up retail and trade-in values.' : 'Decoded the VIN. VinAudit had no retail value.';
            } else message = 'Decoded the VIN. A market value needs a VinAudit key.';
            return finish(item, deps, { ...base(), name: item.name || valueName(item), brand: item.brand, model: item.model, serialNumber: item.serialNumber, details: safeDetails(category, item.details), lookupStatus: 'ready', lookupMessage: message, suggestedValue: suggested, quickSale: quick });
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
            const fair = price?.marketCents != null ? { amountCents: price.marketCents, lowCents: price.lowCents, highCents: price.highCents, sourceName: prices.providerLabel, notes: 'Suggested from the card name on the photo. Confirm before it is saved.' } : null;
            const quick = price?.lowCents != null && price.lowCents > 0 ? { amountCents: price.lowCents, lowCents: null, highCents: null, sourceName: prices.providerLabel, notes: 'The low end of the card price. Confirm before it is saved.' } : null;
            return finish(item, deps, {
                ...base(),
                lookupStatus: fair ? 'ready' : 'skipped',
                lookupMessage: fair ? `Market price from ${prices.providerLabel}.` : 'No card price matched.',
                suggestedValue: fair,
                quickSale: quick
            });
        }

        // watches have no provider step: The Watch API never returned usable prices, so a watch is
        // priced like any other item (eBay when connected, then the price check in finish())

        if (category === 'jewelry') {
            const metal = item.details.metal;
            const weight = typeof item.details.weightGrams === 'number' ? item.details.weightGrams : null;
            const purity = typeof item.details.purity === 'string' ? item.details.purity : null;
            if (metal === 'gold' || metal === 'silver' || metal === 'platinum' || metal === 'palladium') {
                if (weight != null && weight > 0 && purity) {
                    const melt = await deps.metal({ metal, weightGrams: weight, purity });
                    const meltValue: SuggestedValue = {
                        amountCents: melt.meltValueCents,
                        lowCents: null,
                        highCents: null,
                        sourceName: melt.providerLabel,
                        notes: 'Live spot melt value (metal content only). Confirm before it is saved.'
                    };
                    const quickCents = Math.max(1, Math.round(melt.meltValueCents * 0.85));
                    const quickValue: SuggestedValue = {
                        amountCents: quickCents,
                        lowCents: null,
                        highCents: null,
                        sourceName: melt.providerLabel,
                        notes: 'Typical quick-sale estimate (~85% of melt). Confirm before it is saved.'
                    };
                    return finish(item, deps, {
                        ...base(),
                        lookupStatus: 'ready',
                        lookupMessage: 'Melt value from the live spot price.',
                        suggestedValue: meltValue,
                        quickSale: quickValue
                    });
                }
            }
        }

        if (!deps.ebayConfigured()) {
            return finish(item, deps, { ...base(), lookupMessage: 'No price source for this item yet.' });
        }
        const report = await deps.research(blankAsset(item, category), null);
        const range = report.askingRange;
        const fair = range ? { amountCents: range.medianCents, lowCents: range.lowCents, highCents: range.highCents, sourceName: 'eBay active asking prices', notes: `Suggested from ${range.count} listings. Asking prices, not completed sales.` } : null;
        const quick = range && range.lowCents > 0 ? { amountCents: range.lowCents, lowCents: null, highCents: null, sourceName: 'eBay active asking prices', notes: 'The low end of current asking prices. Confirm before it is saved.' } : null;
        return finish(item, deps, {
            ...base(),
            lookupStatus: fair ? 'ready' : 'skipped',
            lookupMessage: fair ? 'Asking-price range from similar listings.' : report.message,
            suggestedValue: fair,
            quickSale: quick
        });
    } catch (err) {
        return finish(item, deps, { ...base(), lookupStatus: 'error', lookupMessage: err instanceof Error ? err.message : 'Price lookup failed.' });
    }
}

function priced(cents: number | null, sourceName: string, notes: string): SuggestedValue | null {
    if (cents == null || cents <= 0) return null;
    return { amountCents: cents, lowCents: null, highCents: null, sourceName, notes };
}

// property stays manual. providers fill fair market first. Gemini runs only when fair market is still empty.
// quick-sale is always paired with fair market (provider value, or 85% of fair market).
async function finish(item: IdentifiedItem, deps: LookupDeps, result: Enrichment): Promise<Enrichment> {
    if (result.category === 'property') return result;
    let next = result;
    if (!next.suggestedValue?.amountCents) {
        const guess = await deps.estimatePrices({ ...item, category: next.category, name: next.name, brand: next.brand, model: next.model, condition: next.condition, details: next.details });
        const fair = guess?.fairMarketCents
            ? priced(guess.fairMarketCents, PRICE_CHECK_SOURCE, 'Rough estimate from an AI price check of the details entered. Not a quote or appraisal.')
            : null;
        if (fair) {
            const note = next.lookupMessage ? `${next.lookupMessage} A price check estimated fair market value.` : 'Fair market value estimated from the details with a price check.';
            next = { ...next, suggestedValue: fair, lookupStatus: 'ready', lookupMessage: note };
        }
    }
    if (next.suggestedValue?.amountCents && !next.quickSale?.amountCents) {
        const quickCents = Math.max(1, Math.round(next.suggestedValue.amountCents * 0.85));
        next = {
            ...next,
            quickSale: priced(quickCents, next.suggestedValue.sourceName, 'Typical quick-sale estimate (~85% of fair market). Confirm before it is saved.')
        };
    }
    return next;
}

function valueName(item: IdentifiedItem): string | null {
    const parts = [item.brand, item.model].filter(Boolean);
    return parts.length ? parts.join(' ') : item.name;
}
