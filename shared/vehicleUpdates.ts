import type { ObservedValueType } from './schemas.js';

export interface VehicleValueUpdates {
    valueTypes: ObservedValueType[];
    nextRefreshAt: string | null;
    lastRefreshedAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
}

// Same day next calendar month, clamped for shorter months (Jan 31 -> Feb 28).
export function nextVehicleRefresh(date: Date): Date {
    const next = new Date(date);
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
    return next;
}
