import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureStatus, captureTtlMs, reviewSteps, type IdentifiedItem } from '../shared/capture.ts';
import { coerceFilledDetails, parseIdentifyJson, questionPrompt } from '../server/capture/identify.ts';
import { parsePriceJson } from '../server/capture/estimate.ts';
import { latestReferencePriceCents, mapWatchSearchRow } from '../server/lookups/watches.ts';
import { suggestValuesForAsset } from '../server/capture/suggest.ts';
import { enrichIdentification, type LookupDeps } from '../server/capture/pipeline.ts';
import { hashCaptureToken, newCaptureToken } from '../server/capture/token.ts';

const item = (patch: Partial<IdentifiedItem> = {}): IdentifiedItem => ({
    category: 'other',
    name: 'Thing',
    brand: null,
    model: null,
    serialNumber: null,
    condition: 'good',
    confidence: 0.8,
    notes: null,
    details: {},
    ...patch
});

test('capture links expire and revoke', () => {
    const now = Date.parse('2026-10-25T00:00:00Z');
    assert.equal(captureTtlMs('once'), 10 * 60 * 1000);
    assert.equal(captureTtlMs('catalog'), 45 * 60 * 1000);
    assert.equal(captureStatus({ revokedAt: null, expiresAt: '2026-10-25T00:09:00Z' }, now), 'open');
    assert.equal(captureStatus({ revokedAt: null, expiresAt: '2026-10-25T00:00:00Z' }, now), 'expired');
    assert.equal(captureStatus({ revokedAt: '2026-10-24T00:00:00Z', expiresAt: '2026-10-25T00:09:00Z' }, now), 'revoked');
});

test('review steps include the category questions and the three values', () => {
    const steps = reviewSteps({
        category: 'vehicle',
        name: 'XT6',
        brand: 'Cadillac',
        model: null,
        serialNumber: null,
        condition: 'good',
        details: { mileage: 61000, trim: '' },
        suggestedValue: { amountCents: 2_800_000, lowCents: null, highCents: null, sourceName: 'VinAudit retail', notes: '' }
    });
    assert.deepEqual(steps.map((step) => step.key), ['category', 'name', 'detail:year', 'brand', 'model', 'detail:trim', 'detail:vin', 'condition', 'detail:mileage', 'purchase', 'value', 'quickSale']);
    assert.equal(steps.find((step) => step.key === 'brand')?.label, 'Make');

    const bare = reviewSteps({
        category: null,
        name: null,
        brand: null,
        model: null,
        serialNumber: null,
        condition: null,
        details: {},
        suggestedValue: null
    });
    assert.deepEqual(bare.map((step) => step.kind), ['category', 'name', 'purchase', 'value', 'quickSale']);
});

test('tokens are stored as a hash, not the raw value', () => {
    const token = newCaptureToken();
    assert.match(token, /^[A-Za-z0-9_-]{32,128}$/);
    assert.notEqual(hashCaptureToken(token), token);
    assert.equal(hashCaptureToken(token), hashCaptureToken(token));
});

test('parses Gemini JSON and drops unknown categories', () => {
    const parsed = parseIdentifyJson('```json\n{"items":[{"category":"vehicle","name":"Cadillac XT6","serialNumber":"1HGCM82633A004352","condition":"good","details":{"mileage":61000}},{"category":"spaceship","name":"Nope"}]}\n```');
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].category, 'vehicle');
    assert.equal(parsed[0].details.mileage, 61000);
});

function deps(partial: Partial<LookupDeps>): LookupDeps {
    const unused = async () => {
        throw new Error('not used');
    };
    return {
        decodeVin: unused as LookupDeps['decodeVin'],
        vehicleValue: unused as LookupDeps['vehicleValue'],
        cards: unused as LookupDeps['cards'],
        metal: unused as LookupDeps['metal'],
        research: unused as LookupDeps['research'],
        watchValue: unused as LookupDeps['watchValue'],
        estimatePrices: async () => null,
        vinauditConfigured: () => false,
        ebayConfigured: () => false,
        watchConfigured: () => false,
        ...partial
    };
}

test('a vehicle VIN is decoded and then priced when VinAudit is configured', async () => {
    const result = await enrichIdentification(
        item({ category: 'vehicle', name: null, brand: null, details: { vin: '1hgcm82633a004352', mileage: 61000.4 } }),
        deps({
            vinauditConfigured: () => true,
            decodeVin: async () => ({
                provider: 'nhtsa_vpic',
                providerLabel: 'NHTSA vPIC',
                fetchedAt: '2026-10-25T00:00:00Z',
                vin: '1HGCM82633A004352',
                suggestions: [
                    { field: 'brand', label: 'Make', value: 'Honda', display: 'Honda' },
                    { field: 'model', label: 'Model', value: 'Accord', display: 'Accord' },
                    { field: 'details.year', label: 'Year', value: 2003, display: '2003' },
                    { field: 'details.vin', label: 'VIN', value: '1HGCM82633A004352', display: '1HGCM82633A004352' }
                ],
                specs: [],
                warnings: []
            }),
            vehicleValue: async (q) => {
                assert.equal(q.vin, '1HGCM82633A004352');
                assert.equal(q.mileage, 61000);
                return {
                    provider: 'vinaudit',
                    providerLabel: 'VinAudit',
                    fetchedAt: '2026-10-25T00:00:00Z',
                    vehicle: '2003 Honda Accord',
                    mileage: 61000,
                    retail: { valueCents: 450000, lowCents: 400000, highCents: 500000, sampleCount: 10, certainty: 80 },
                    tradeIn: null,
                    period: null,
                    adjustments: [],
                    notes: []
                };
            }
        })
    );
    assert.equal(result.brand, 'Honda');
    assert.equal(result.model, 'Accord');
    assert.equal(result.details.year, 2003);
    assert.equal(result.suggestedValue?.amountCents, 450000);
    assert.equal(result.lookupStatus, 'ready');
});

test('homes and missing price keys are skipped instead of invented', async () => {
    const home = await enrichIdentification(item({ category: 'property', name: 'House' }), deps({}));
    assert.equal(home.lookupStatus, 'skipped');
    assert.equal(home.suggestedValue, null);

    const watch = await enrichIdentification(item({ category: 'watch', name: 'Submariner', brand: 'Rolex' }), deps({}));
    assert.equal(watch.suggestedValue, null);
    assert.match(watch.lookupMessage ?? '', /The Watch API/);
});

test('a watch reference uses The Watch API, and a price check only fills missing fair market', async () => {
    const priced = await enrichIdentification(
        item({ category: 'watch', name: 'Submariner', brand: 'Rolex', details: { referenceNumber: '126610LN' } }),
        deps({
            watchConfigured: () => true,
            watchValue: async (q) => {
                assert.equal(q.brand, 'Rolex');
                assert.equal(q.reference, '126610LN');
                return {
                    provider: 'thewatchapi',
                    providerLabel: 'The Watch API',
                    fetchedAt: '2026-10-25T00:00:00Z',
                    brand: 'Rolex',
                    reference: '126610LN',
                    fairMarketCents: 1_450_000,
                    quickSaleCents: 1_232_500,
                    sourceName: 'The Watch API',
                    method: 'Reference asking-price average',
                    notes: ['Asking averages.']
                };
            },
            estimatePrices: async () => ({ fairMarketCents: 9_999_999, quickSaleCents: 1_200_000 })
        })
    );
    assert.equal(priced.suggestedValue?.amountCents, 1_450_000);
    assert.equal(priced.suggestedValue?.sourceName, 'The Watch API');
    assert.equal(priced.quickSale?.amountCents, 1_232_500);
    assert.equal(priced.quickSale?.sourceName, 'The Watch API');

    const guessed = await enrichIdentification(
        item({ category: 'electronics', name: 'Laptop', brand: 'Apple', model: 'MacBook Pro' }),
        deps({
            estimatePrices: async () => ({ fairMarketCents: 800_000, quickSaleCents: 650_000 })
        })
    );
    assert.equal(guessed.suggestedValue?.amountCents, 800_000);
    assert.equal(guessed.suggestedValue?.sourceName, 'Price check');
    assert.equal(guessed.quickSale, null);
});

test('the second identification pass asks a car for make, model, and year', () => {
    const prompt = questionPrompt('vehicle');
    assert.match(prompt, /brand \(Make\)/);
    assert.match(prompt, /model \(Model\)/);
    assert.match(prompt, /year/);
    assert.match(prompt, /mileage/);
    const details = coerceFilledDetails('vehicle', { year: '2020', trim: 'Premium', titleStatus: 'Clean', vin: '1HGCM82633A004352' });
    assert.equal(details.year, 2020);
    assert.equal(details.titleStatus, 'clean');
    assert.equal(details.vin, '1HGCM82633A004352');
});

test('a price check and The Watch API responses parse without inventing a purchase price', () => {
    assert.deepEqual(parsePriceJson('{"fairMarketCents":150000,"quickSaleCents":110000}'), { fairMarketCents: 150000, quickSaleCents: null });
    assert.equal(latestReferencePriceCents({ data: [{ date: '2026-01-01', price: 24653.12 }] }), 2_465_312);
    const row = mapWatchSearchRow({ brand: 'Rolex', reference_number: '116520', model: 'Rolex Daytona', movement: 'Automatic', case_diameter: '40 mm' });
    assert.equal(row?.referenceNumber, '116520');
    assert.equal(row?.model, 'Daytona');
});

test('jewelry melt from the metal API is fair market and gemini is not used', async () => {
    let geminiCalled = false;
    const ring = await enrichIdentification(
        item({ category: 'jewelry', name: 'Gold necklace', details: { kind: 'jewelry', metal: 'gold', weightGrams: 10, purity: '14k' } }),
        deps({
            metal: async () => ({
                provider: 'gold-api',
                providerLabel: 'gold-api.com',
                fetchedAt: '2026-10-25T00:00:00Z',
                metal: 'gold',
                purity: '14k',
                weightGrams: 10,
                fineOunces: 0.2,
                spotCentsPerOunce: 250_000,
                meltValueCents: 50_000,
                notes: []
            }),
            estimatePrices: async () => {
                geminiCalled = true;
                return { fairMarketCents: 1, quickSaleCents: null };
            }
        })
    );
    assert.equal(ring.suggestedValue?.amountCents, 50_000);
    assert.equal(ring.suggestedValue?.sourceName, 'gold-api.com');
    assert.equal(geminiCalled, false);
});

test('suggest-values uses the same enrichIdentification path as capture', async () => {
    const suggested = await suggestValuesForAsset({
        category: 'other',
        name: 'Thing',
        details: {}
    });
    assert.equal(suggested.fairMarket, null);
});

test('a trading card uses the matched market price', async () => {
    const card = await enrichIdentification(
        item({ category: 'collectible', name: 'Charizard', details: { kind: 'trading_card', setName: 'Base Set', cardNumber: '4' } }),
        deps({
            cards: async (q) => {
                assert.equal(q.game, 'pokemon');
                assert.equal(q.name, 'Charizard');
                return {
                    provider: 'tcgdex',
                    providerLabel: 'TCGdex',
                    fetchedAt: '2026-10-25T00:00:00Z',
                    game: 'pokemon',
                    matches: [
                        {
                            id: 'base1-4',
                            name: 'Charizard',
                            setName: 'Base Set',
                            number: '4',
                            rarity: null,
                            imageUrl: null,
                            url: null,
                            exact: true,
                            prices: [{ label: 'Holofoil', currency: 'USD', marketCents: 170000, lowCents: 150000, highCents: 190000, source: 'TCGplayer' }]
                        }
                    ],
                    notes: []
                };
            }
        })
    );
    assert.equal(card.suggestedValue?.amountCents, 170000);
    assert.equal(card.lookupStatus, 'ready');
});
