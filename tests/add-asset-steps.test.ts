import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyFormValues, suggestedName, toPayload } from '../src/lib/assetForm.ts';
import { IDENTITY_FIELDS } from '../shared/identity.ts';
import { fieldsForStep, identityFields, stepForField, stepsFor } from '../src/lib/addAssetSteps.ts';

const base = (category: Parameters<typeof stepsFor>[0]['category'], extra = {}) => ({ ...emptyFormValues(), name: 'Thing', category, ...extra });

test('a house skips the condition step, a car keeps it', () => {
    assert.deepEqual(stepsFor(base('property')), ['category', 'identity', 'details', 'money', 'proof']);
    assert.deepEqual(stepsFor(base('vehicle')), ['category', 'identity', 'details', 'condition', 'money', 'proof']);
});

test('a category with no extra fields skips the details step', () => {
    assert.deepEqual(stepsFor(base('other')), ['category', 'identity', 'condition', 'money', 'proof']);
});

test('identity asks the right things for each category', () => {
    assert.deepEqual(identityFields('vehicle'), IDENTITY_FIELDS.vehicle);
    assert.deepEqual(identityFields('property'), ['details.addressLine1', 'details.city', 'details.state', 'details.postalCode']);
    // fields asked on the identity step are not asked again on the details step
    assert.equal(fieldsForStep('details', base('vehicle')).includes('details.vin'), false);
    assert.equal(fieldsForStep('details', base('vehicle')).includes('details.mileage'), true);
});

test('errors map back to the step that asked the field', () => {
    assert.equal(stepForField('details.vin', base('vehicle')), 'identity');
    assert.equal(stepForField('details.mileage', base('vehicle')), 'details');
    assert.equal(stepForField('estimateAmount', base('watch')), 'money');
    assert.equal(stepForField('name', base('watch')), 'identity');
});

test('questions that do not apply are cleared on save', () => {
    const house = toPayload(base('property', { condition: 'good', location: 'Garage', serialNumber: 'X1' }));
    assert.equal(house.condition, null);
    assert.equal(house.location, null);
    assert.equal(house.serialNumber, null);
    const car = toPayload(base('vehicle', { condition: 'good', serialNumber: 'X1' }));
    assert.equal(car.condition, 'good');
    assert.equal(car.serialNumber, null);
});

test('the name fills itself in from what was typed', () => {
    assert.equal(suggestedName(base('vehicle', { brand: 'Cadillac', model: 'XT6', details: { year: '2020' } })), '2020 Cadillac XT6');
    assert.equal(suggestedName(base('property', { details: { addressLine1: '89 Carnation Road' } })), '89 Carnation Road');
});

test('a typed-in value is saved as a manual entry, not an AI price check', () => {
    const p = toPayload(base('electronics', { estimateAmount: '900', quickSaleAmount: '700' }));
    assert.equal(p.estimate?.source, 'user');
    assert.equal(p.estimate?.sourceName, null);
    assert.equal(p.liquidationEstimate?.source, 'user');
});

test('a suggested value keeps its source only while the amount is unchanged', () => {
    const suggest = {
        fairMarket: { amountCents: 100000, sourceName: 'AI price check', notes: 'Rough estimate' },
        quickSale: { amountCents: 85000, sourceName: 'AI price check', notes: '85%' }
    };
    const kept = toPayload(base('electronics', { estimateAmount: '1000', quickSaleAmount: '850' }), suggest);
    assert.equal(kept.estimate?.source, 'provider');
    assert.equal(kept.estimate?.sourceName, 'AI price check');
    const changed = toPayload(base('electronics', { estimateAmount: '1200', quickSaleAmount: '850' }), suggest);
    assert.equal(changed.estimate?.source, 'user');
    assert.equal(changed.liquidationEstimate?.source, 'provider');
});
