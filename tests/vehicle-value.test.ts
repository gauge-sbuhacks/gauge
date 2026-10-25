import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateInputSchema, vehicleValueQuerySchema } from '../shared/schemas.ts';
import { vehicleValueQueryFor } from '../src/lib/vehicleValue.ts';
import { lookupVehicleValue } from '../server/lookups/vinaudit.ts';

const query = { year: 2020, make: 'Toyota', model: 'Camry', mileage: 60000 };
// Real documented hierarchy; IDs deliberately do not follow a pattern we could construct.
const selections = { selections: { years: [{ name: 2020, makes: [{ name: 'Toyota', models: [{ name: 'Camry', trims: [
    { id: 'provider-se-id', name: 'SE' }, { id: 'provider-base-id', name: 'Base' }
] }] }] }] } };
const price = (amount = 20000) => ({ success: true, vehicle: '2020 Toyota Camry Base', mileage: 60000, count: 30, certainty: 90, prices: { average: amount, below: amount - 2000, above: amount + 2000 } });
let keyNumber = 0;

async function withProvider(handler: (url: URL) => unknown, run: (calls: URL[]) => Promise<void>) {
    const previousKey = process.env.VINAUDIT_API_KEY;
    const originalFetch = globalThis.fetch;
    const calls: URL[] = [];
    process.env.VINAUDIT_API_KEY = `test-vehicle-${++keyNumber}`;
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        calls.push(url);
        const result = handler(url);
        return result instanceof Response ? result : Response.json(result);
    };
    try { await run(calls); }
    finally {
        globalThis.fetch = originalFetch;
        if (previousKey == null) delete process.env.VINAUDIT_API_KEY;
        else process.env.VINAUDIT_API_KEY = previousKey;
    }
}

test('valuation accepts a VIN or year/make/model, rejecting missing identity and malformed inputs', () => {
    assert.equal(vehicleValueQuerySchema.safeParse(query).success, true);
    assert.equal(vehicleValueQuerySchema.safeParse({ vin: '2t1burhe3ec020936' }).success, true);
    assert.equal(vehicleValueQuerySchema.safeParse({ ...query, vin: '' }).success, true);
    for (const invalid of [{}, { year: 2020, make: 'Toyota' }, { ...query, model: ' ' }, { ...query, vin: 'partial' }, { ...query, mileage: -1 }, { ...query, year: 2020.5 }]) {
        assert.equal(vehicleValueQuerySchema.safeParse(invalid).success, false);
    }
});

test('add forms and saved assets produce the same query, including zero mileage and partial VIN fallback', () => {
    const typed = vehicleValueQueryFor({ brand: 'Toyota', model: 'Camry', details: { year: 2020, mileage: 60000 } });
    const form = vehicleValueQueryFor({ brand: ' Toyota ', model: 'Camry', details: { year: '2020', mileage: '60,000', vin: '2T1BURHE3EC' } });
    assert.deepEqual(form, typed);
    assert.equal(vehicleValueQueryFor({ details: { mileage: '0', vin: '2t1burhe3ec020936' } }).mileage, 0);
    assert.equal(vehicleValueQueryFor({ details: { vin: '2t1burhe3ec020936' } }).vin, '2T1BURHE3EC020936');
    assert.equal(vehicleValueQueryFor({ details: {} }).year, null);
});

test('initial estimate input preserves provider attribution and reference-trim assumptions', () => {
    const input = { valueType: 'fair_market', amountCents: 2000000, observedAt: '2026-10-25', source: 'provider', sourceName: 'VinAudit retail', notes: 'Rough estimate using the Base reference trim.' };
    assert.deepEqual(estimateInputSchema.parse(input), input);
    assert.equal(estimateInputSchema.safeParse({ ...input, source: 'invented' }).success, false);
    assert.equal(estimateInputSchema.safeParse({ valueType: 'fair_market', amountCents: 50000 }).success, true);
});

test('no VIN resolves a real provider ID, labels the reference trim, and caches all three requests', async () => {
    await withProvider((url) => url.hostname.startsWith('specifications') ? selections : price(url.searchParams.get('type') === 'retail' ? 20000 : 17000), async (calls) => {
        const result = await lookupVehicleValue(query);
        assert.equal(calls.length, 3);
        assert.equal(calls[0].searchParams.get('list'), 'year+make+model+trim');
        assert.equal(calls[0].searchParams.get('year'), '2020');
        for (const url of calls.slice(1)) {
            assert.equal(url.searchParams.get('id'), 'provider-base-id');
            assert.equal(url.searchParams.has('vin'), false);
            assert.equal(url.searchParams.get('mileage'), '60000');
        }
        assert.equal(result.retail?.valueCents, 2000000);
        assert.equal(result.tradeIn?.valueCents, 1700000);
        assert.equal(result.trimSelection?.assumed, true);
        assert.equal(result.trimSelection?.name, 'Base');
        assert.match(result.notes.join(' '), /reference trim/);
        assert.deepEqual(await lookupVehicleValue(query), result);
        assert.equal(calls.length, 3);
    });
});

test('explicit trim is matched without regard to casing; changing mileage reuses selections but reprices', async () => {
    await withProvider((url) => url.hostname.startsWith('specifications') ? selections : price(), async (calls) => {
        const result = await lookupVehicleValue({ ...query, trim: 'se', mileage: 0, condition: 'excellent', titleStatus: 'rebuilt' });
        assert.equal(result.trimSelection?.assumed, false);
        assert.equal(result.trimSelection?.name, 'SE');
        assert.equal(calls[1].searchParams.get('id'), 'provider-se-id');
        assert.equal(calls[1].searchParams.get('mileage'), '0');
        assert.equal(calls[1].searchParams.get('condition'), 'like_new');
        assert.equal(calls[1].searchParams.get('known_damage'), 'brand');
        await lookupVehicleValue({ ...query, trim: 'se', mileage: 1000 });
        assert.equal(calls.length, 5);
    });
});

test('an unknown explicit trim or wrong model never silently selects another vehicle', async () => {
    await withProvider(() => selections, async (calls) => {
        await assert.rejects(lookupVehicleValue({ ...query, trim: 'Does not exist' }), /Available trims: Base, SE/);
        assert.equal(calls.length, 1);
        await assert.rejects(lookupVehicleValue({ ...query, model: 'Corolla' }), /could not find this year, make, and model/);
        assert.equal(calls.length, 2);
    });
});

test('VIN lookups bypass selections and preserve usable prices if trade-in fails', async () => {
    await withProvider((url) => url.searchParams.get('type') === 'tradein' ? { success: false, error: 'no_data' } : price(), async (calls) => {
        const result = await lookupVehicleValue({ vin: '2t1burhe3ec020936' });
        assert.equal(calls.length, 2);
        assert.ok(calls.every((url) => url.hostname === 'marketvalue.vinaudit.com'));
        assert.equal(calls[0].searchParams.get('vin'), '2T1BURHE3EC020936');
        assert.equal(calls[0].searchParams.get('mileage'), 'average');
        assert.equal(result.retail?.valueCents, 2000000);
        assert.equal(result.tradeIn, null);
        assert.equal(result.trimSelection, undefined);
        assert.match(result.notes[0], /average mileage/);
    });
});

test('selections authentication and quota failures give actionable messages without calling pricing', async () => {
    for (const response of [new Response('{}', { status: 401 }), { success: false, error: 'api_not_enabled' }]) {
        await withProvider(() => response, async (calls) => {
            await assert.rejects(lookupVehicleValue(query), /Vehicle Selections/);
            assert.equal(calls.length, 1);
        });
    }
    await withProvider(() => ({ success: false, error: 'billing_limit_exceeded' }), async () => {
        await assert.rejects(lookupVehicleValue(query), /out of queries/);
    });
});

test('unusable and malformed provider responses do not become a $0 estimate', async () => {
    await withProvider((url) => url.hostname.startsWith('specifications') ? selections : { success: true, prices: { average: 0 } }, async () => {
        await assert.rejects(lookupVehicleValue(query), /no usable market value/);
    });
    await withProvider(() => new Response('not json'), async () => {
        await assert.rejects(lookupVehicleValue(query), /unreadable response/);
    });
});
