// which questions each category asks first, after the category itself is chosen.
// the add-asset form and the photo identification pass both read this list, so a car
// is asked for its VIN, year, make, and model in both places.

import { getCategory, type CategoryId } from './categories.js';

export type IdentityField = 'brand' | 'model' | `details.${string}`;

export const IDENTITY_FIELDS: Record<CategoryId, IdentityField[]> = {
    vehicle: ['details.vin', 'details.year', 'brand', 'model', 'details.trim'],
    property: ['details.addressLine1', 'details.city', 'details.state', 'details.postalCode'],
    watch: ['brand', 'model', 'details.referenceNumber'],
    jewelry: ['details.kind', 'brand', 'model'],
    collectible: ['details.kind', 'details.game', 'brand', 'model'],
    electronics: ['brand', 'model', 'details.modelNumber'],
    household: ['details.kind', 'brand', 'model'],
    equipment: ['brand', 'model', 'details.modelNumber'],
    other: ['brand', 'model']
};

// identity fields the category actually has (a house has no brand)
export function identityFields(category: CategoryId): IdentityField[] {
    const def = getCategory(category);
    return IDENTITY_FIELDS[category].filter((field) => {
        if (field === 'brand') return def.brandLabel != null;
        if (field === 'model') return def.modelLabel != null;
        return def.fields.some((item) => item.key === field.slice('details.'.length));
    });
}

// category fields that were not already asked with the name, make, and model
export function detailKeys(category: CategoryId): string[] {
    const asked = new Set(identityFields(category).filter((field) => field.startsWith('details.')).map((field) => field.slice('details.'.length)));
    return getCategory(category).fields.filter((field) => !asked.has(field.key)).map((field) => field.key);
}
