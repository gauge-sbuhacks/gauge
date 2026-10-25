import type { AssetRecord } from './schemas.js';

export interface HistoricalPoint { date: string; valueCents: number; }
export interface HistoricalSeries {
    id: string;
    label: string;
    basis: 'metal_benchmark' | 'retail' | 'asking';
    currency: 'USD';
    points: HistoricalPoint[];
    source: string;
    sourceUrl: string;
    fetchedAt: string;
    note: string;
}
export interface HistoryResponse {
    available: boolean;
    status: 'ready' | 'not_loaded' | 'needs_key' | 'needs_details' | 'unsupported' | 'unavailable';
    message: string;
    series: HistoricalSeries[];
}

export const historyVersion = (asset: Pick<AssetRecord,'name'|'category'|'brand'|'model'|'condition'|'currency'|'details'>) =>
    JSON.stringify([asset.name,asset.category,asset.brand,asset.model,asset.condition,asset.currency,asset.details]);

export function historyKind(asset: Pick<AssetRecord,'category'|'details'|'brand'|'model'|'name'>): 'metal' | 'magic' | null {
    if (asset.category === 'jewelry' && ['gold','silver','platinum','palladium'].includes(String(asset.details.metal))) return 'metal';
    if (asset.category === 'collectible' && asset.details.kind === 'trading_card' &&
        (asset.details.game === 'magic' || (!asset.details.game && /magic|mtg|gathering|wizards/i.test([asset.brand,asset.model,asset.name].join(' '))))) return 'magic';
    return null;
}

// Provider history is never extended or projected: each point must be a dated observation.
export function normalizeHistory(raw: { date: unknown; value: unknown }[], maxDate = new Date().toISOString().slice(0,10)): HistoricalPoint[] {
    const byDate = new Map<string, number>();
    for (const row of raw) {
        if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.date > maxDate) continue;
        const date = new Date(`${row.date}T00:00:00Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== row.date) continue;
        if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) continue;
        const cents = Math.round(row.value * 100);
        if (Number.isSafeInteger(cents)) byDate.set(row.date,cents);
    }
    return [...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,valueCents])=>({ date,valueCents }));
}
