import type { Condition, VehicleValueQuery } from './schemas.js';

// Both saved assets (typed details) and the add form (string details) use this query.
export function vehicleValueQueryFor(asset: { brand?: string | null; model?: string | null; condition?: Condition | '' | null; details: Record<string, unknown> }): VehicleValueQuery {
    const str = (key: string) => typeof asset.details[key] === 'string' ? (asset.details[key] as string).trim() : '';
    const num = (key: string) => {
        const value = asset.details[key];
        return value == null || value === '' ? null : typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
    };
    const vin = str('vin').toUpperCase();
    return {
        vin: /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null,
        year: num('year'),
        make: asset.brand?.trim() || null,
        model: asset.model?.trim() || null,
        trim: str('trim') || null,
        mileage: num('mileage'),
        condition: asset.condition || null,
        titleStatus: str('titleStatus') || null
    };
}

