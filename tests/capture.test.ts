import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureStatus, captureTtlMs, reviewSteps, type IdentifiedItem } from '../shared/capture.ts';
import { parseIdentifyJson } from '../server/capture/identify.ts';
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

test('review steps always include name and category, then only filled fields', () => {
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
    assert.deepEqual(steps.map((step) => step.key), ['category', 'name', 'brand', 'condition', 'detail:mileage', 'value']);
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
    assert.deepEqual(bare.map((step) => step.kind), ['category', 'name']);
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
        vinauditConfigured: () => false,
        ebayConfigured: () => false,
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

    const watch = await enrichIdentification(item({ category: 'watch', name: 'Submariner', brand: 'Rolex' }), deps({ ebayConfigured: () => false }));
    assert.equal(watch.suggestedValue, null);
    assert.match(watch.lookupMessage ?? '', /eBay/);
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
