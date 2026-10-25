// the step-by-step "add an asset" flow: which questions to ask, in what order, for each category.
// pick a category first, and everything after it is shaped by that choice. only the category and a
// name are required; every step after "what is it" can be skipped.

import { getCategory, isFieldVisible, usesCommonField, type CategoryId, type Details } from '@shared/categories.ts';
import type { AssetFormValues } from './assetForm.ts';

export type StepId = 'category' | 'identity' | 'details' | 'condition' | 'money' | 'proof';

// a field on the identity step: the shared brand / model inputs, or one of the category's own fields
export type IdentityField = 'brand' | 'model' | `details.${string}`;

interface CategoryCopy {
    identity: { question: string; help: string; fields: IdentityField[] };
    details?: { question: string; help: string };
}

// per category: what "what is it" asks, and how the extra-details step is worded
const COPY: Record<CategoryId, CategoryCopy> = {
    vehicle: {
        identity: {
            question: 'Tell us about the vehicle.',
            help: 'Have the VIN? Decode it and we fill in the year, make, and model. Otherwise just type them in.',
            fields: ['details.vin', 'details.year', 'brand', 'model', 'details.trim']
        },
        details: { question: 'Mileage, color, and title.', help: 'Mileage matters most for market value.' }
    },
    property: {
        identity: {
            question: 'Where is the property?',
            help: 'The address is what a home value estimate is based on.',
            fields: ['details.addressLine1', 'details.city', 'details.state', 'details.postalCode']
        },
        details: { question: 'About the home.', help: 'Size and room counts make the home value estimate more accurate.' }
    },
    watch: {
        identity: {
            question: 'Which watch is it?',
            help: 'The reference number is usually on the case back or the warranty card.',
            fields: ['brand', 'model', 'details.referenceNumber']
        },
        details: { question: 'Box, papers, and specs.', help: 'A full set, with box and papers, is worth noticeably more.' }
    },
    jewelry: {
        identity: { question: 'What kind of piece is it?', help: 'Bullion, a coin, jewelry, or a loose stone.', fields: ['details.kind', 'brand', 'model'] },
        details: { question: 'Metal, weight, and purity.', help: 'With these, Gauge can work out the melt value from today\'s spot price.' }
    },
    collectible: {
        identity: { question: 'What kind of collectible is it?', help: 'The type decides which details we ask for next.', fields: ['details.kind', 'details.game', 'brand', 'model'] },
        details: { question: 'Set, grade, and history.', help: 'Graded items with a cert number are the easiest to price and to prove.' }
    },
    electronics: {
        identity: { question: 'What is it?', help: 'The model number is usually on a label underneath or in the settings.', fields: ['brand', 'model', 'details.modelNumber'] },
        details: { question: 'Specs and warranty.', help: 'A warranty date shows up on your dashboard before it runs out.' }
    },
    household: {
        identity: { question: 'What kind of item is it?', help: 'Furniture, a rug, an instrument, an appliance, and so on.', fields: ['details.kind', 'brand', 'model'] },
        details: { question: 'Materials and size.', help: 'These help when it comes time to sell or insure it.' }
    },
    equipment: {
        identity: { question: 'What is it?', help: 'The model number is usually on the data plate.', fields: ['brand', 'model', 'details.modelNumber'] },
        details: { question: 'Service and warranty.', help: 'Service dates keep a record of upkeep.' }
    },
    other: {
        identity: { question: 'What is it?', help: 'A name is all we need. A brand and model help with pricing later.', fields: ['brand', 'model'] }
    }
};

export function identityCopy(category: CategoryId) {
    return COPY[category].identity;
}

// identity fields the category actually has (no brand box for a house)
export function identityFields(category: CategoryId): IdentityField[] {
    const def = getCategory(category);
    return COPY[category].identity.fields.filter((f) => {
        if (f === 'brand') return def.brandLabel != null;
        if (f === 'model') return def.modelLabel != null;
        return def.fields.some((d) => d.key === f.slice('details.'.length));
    });
}

// the category's own fields that weren't asked on the identity step, in their usual order
export function detailKeys(category: CategoryId): string[] {
    const asked = new Set(identityFields(category).filter((f) => f.startsWith('details.')).map((f) => f.slice('details.'.length)));
    return getCategory(category).fields.filter((f) => !asked.has(f.key)).map((f) => f.key);
}

export function detailsCopy(category: CategoryId) {
    const def = getCategory(category);
    return COPY[category].details ?? { question: `More about the ${def.singular.toLowerCase()}.`, help: 'All optional.' };
}

// which steps this asset gets. a category with nothing extra to ask skips that step
export function stepsFor(values: AssetFormValues): StepId[] {
    if (!values.category) return ['category', 'identity', 'details', 'condition', 'money', 'proof'];
    const category = values.category;
    const steps: StepId[] = ['category', 'identity'];
    const def = getCategory(category);
    const remaining = new Set(detailKeys(category));
    if (def.fields.some((f) => remaining.has(f.key) && isFieldVisible(f, values.details as Details))) steps.push('details');
    if (usesCommonField(category, 'condition') || usesCommonField(category, 'location')) steps.push('condition');
    steps.push('money', 'proof');
    return steps;
}

// form fields each step owns: checked before moving on, and used to jump back to a step when the
// server rejects one of its fields
export function fieldsForStep(step: StepId, values: AssetFormValues): string[] {
    const category = values.category;
    switch (step) {
        case 'category':
            return ['category'];
        case 'identity':
            return category ? [...identityFields(category), 'name'] : ['name'];
        case 'details':
            return category ? detailKeys(category).map((k) => `details.${k}`) : [];
        case 'condition':
            return ['condition', 'location'];
        case 'money':
            return ['purchaseDate', 'purchasePrice', 'estimateType', 'estimateAmount', 'estimateDate'];
        case 'proof':
            return ['serialNumber', 'notes'];
    }
}

export function stepForField(field: string, values: AssetFormValues): StepId | null {
    for (const step of stepsFor(values)) {
        if (fieldsForStep(step, values).includes(field)) return step;
    }
    return null;
}
