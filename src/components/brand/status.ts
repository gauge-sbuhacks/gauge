export const BRAND_BASE = '/brand';

export type PressureLevel = 'good' | 'warning' | 'serious' | 'critical';

export interface PressureStatus {
    level: PressureLevel;
    label: string;
}

/** Bands match the gauge dial: good < 25, warning < 50, serious < 75, critical from 75. */
export function pressureStatus(value: number): PressureStatus {
    const v = clampPercent(value);
    if (v < 25) return { level: 'good', label: 'Low pressure' };
    if (v < 50) return { level: 'warning', label: 'Building' };
    if (v < 75) return { level: 'serious', label: 'High pressure' };
    return { level: 'critical', label: 'Critical' };
}

export function clampPercent(value: number): number {
    if (Number.isNaN(value)) return 0;
    return Math.min(100, Math.max(0, value));
}

export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
