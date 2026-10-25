import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commonFieldRole, fieldRole } from '../shared/categories.ts';
import { valueOriginOf, valueSourceText } from '../src/lib/valueOrigin.ts';
import { applyExample, exampleFor } from '../src/lib/walkthrough.ts';

test('values say where they came from', () => {
    assert.equal(valueOriginOf({ source: 'user', sourceName: null }), 'manual');
    assert.equal(valueSourceText({ source: 'user', sourceName: null }), 'Manual entry');
    // older add-flow saves stored typed values as a provider value
    assert.equal(valueOriginOf({ source: 'provider', sourceName: 'Entered during add' }), 'manual');
    assert.equal(valueOriginOf({ source: 'provider', sourceName: 'AI price check' }), 'ai');
    assert.equal(valueSourceText({ source: 'provider', sourceName: 'VinAudit retail' }), 'VinAudit retail');
    assert.equal(valueOriginOf({ source: 'sample', sourceName: null }), 'sample');
});

test('fields are tagged as helping the estimate or for your records', () => {
    assert.equal(fieldRole('vehicle', 'mileage'), 'value');
    assert.equal(fieldRole('vehicle', 'exteriorColor'), 'record');
    assert.equal(fieldRole('property', 'squareFeet'), 'value');
    assert.equal(fieldRole('equipment', 'serviceNotes'), 'record');
    assert.equal(commonFieldRole('condition'), 'value');
    assert.equal(commonFieldRole('notes'), 'record');
});

test('the walkthrough example only fills empty boxes, and only for the car', () => {
    assert.equal(exampleFor('identity', 'watch'), null);
    const fill = exampleFor('identity', 'vehicle')!;
    const form: Record<string, string> = { brand: 'Honda', name: '' };
    const n = applyExample(fill, (f) => form[f] ?? '', (f, v) => (form[f] = v));
    assert.equal(form.brand, 'Honda');
    assert.equal(form.model, 'RAV4');
    assert.equal(n, Object.keys(fill).length - 1);
});
