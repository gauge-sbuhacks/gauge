// the home value lookup's query, built from a house's details. works with the add form's details
// (strings, as typed) and a saved asset's details (numbers)

import type { api } from '@/api/api.ts';

export type PropertyValueQuery = Parameters<typeof api.propertyValue>[0];

export function propertyValueQueryFor(details: Record<string, unknown>): PropertyValueQuery {
    const str = (key: string) => (typeof details[key] === 'string' ? (details[key] as string).trim() : '');
    const num = (key: string) => {
        const value = details[key];
        if (typeof value === 'number') return value;
        if (typeof value !== 'string' || !value.trim()) return null;
        const n = Number(value.replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    };
    return {
        addressLine1: str('addressLine1'),
        city: str('city'),
        state: str('state'),
        postalCode: str('postalCode') || null,
        propertyType: str('propertyType') || null,
        bedrooms: num('bedrooms'),
        bathrooms: num('bathrooms'),
        squareFeet: num('squareFeet')
    };
}

// what's still needed before rentcast can look the address up (empty when it's ready)
export function missingAddressParts(q: PropertyValueQuery): string[] {
    return [!q.addressLine1 && 'street address', !q.city && 'city', q.state.length < 2 && 'state'].filter(Boolean) as string[];
}
