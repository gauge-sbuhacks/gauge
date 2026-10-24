// portfolio math, all derived on the client from { assets, valuations }.
// rules from the plan:
//   - missing values are "not entered", never zero
//   - every total says which value type it is and how many assets it covers
//   - never add purchase cost, replacement, and resale together
//   - history only comes from recorded observations (no invented past prices)

import { getCategory, identifierFields, type CategoryDef, type CategoryId } from '@shared/categories.ts';
import { representativeCents } from '@shared/money.ts';
import type { AssetRecord, ObservedValueType, PortfolioResponse, ValuationRecord, ValueType } from '@shared/schemas.ts';
import { daysBetween, formatDate, parseIsoDate, todayIso } from './format.ts';

// ---------- per-asset model ----------

export type CheckId = 'identifier' | 'purchase' | 'estimate' | 'condition' | 'location' | 'insurance';

export interface CompletenessCheck {
    id: CheckId;
    label: string;
    done: boolean;
    hint: string;
}

export interface PortfolioItem {
    asset: AssetRecord;
    category: CategoryDef;
    // oldest first
    valuations: ValuationRecord[];
    latest: Record<ObservedValueType, ValuationRecord | null>;
    checks: CompletenessCheck[];
    done: number;
    total: number;
    identifier: { label: string; value: string } | null;
    // has a current value and some proof (an identifier or purchase record)
    documented: boolean;
    // insured or scheduled on a policy
    covered: boolean;
}

function identifierOf(asset: AssetRecord): { label: string; value: string } | null {
    for (const f of identifierFields(asset.category)) {
        const v = asset.details[f.key];
        if (typeof v === 'string' && v.trim() !== '') return { label: f.label, value: v };
    }
    if (asset.serialNumber) return { label: 'Serial number', value: asset.serialNumber };
    return null;
}

function identifierHint(category: CategoryId): string {
    const f = identifierFields(category)[0];
    if (!f) return 'Add a serial number or other ID';
    // "Reference number" -> "reference number", but keep acronyms like "VIN" as they are
    const first = f.label.split(' ')[0];
    const label = first === first.toUpperCase() ? f.label : f.label[0].toLowerCase() + f.label.slice(1);
    return `Add the ${label} or a serial number`;
}

function buildItem(asset: AssetRecord, valuations: ValuationRecord[]): PortfolioItem {
    const category = getCategory(asset.category);
    const latest: PortfolioItem['latest'] = { fair_market: null, replacement: null, liquidation: null };
    for (const v of valuations) {
        // valuations arrive oldest first, so the last one of each type wins
        if (v.currency === asset.currency) latest[v.valueType] = v;
    }

    const identifier = identifierOf(asset);
    const hasPurchase = asset.purchaseDate != null || asset.purchasePriceCents != null;
    const hasEstimate = latest.fair_market != null || latest.replacement != null;

    const checks: CompletenessCheck[] = [
        { id: 'identifier', label: 'Serial or ID', done: identifier != null, hint: identifierHint(asset.category) },
        { id: 'purchase', label: 'Purchase info', done: hasPurchase, hint: 'Add the purchase date or price' },
        { id: 'estimate', label: 'Current value', done: hasEstimate, hint: 'Record a fair market or replacement value' },
        { id: 'condition', label: 'Condition', done: asset.condition != null, hint: 'Set the condition' },
        { id: 'insurance', label: 'Insurance status', done: asset.insurance != null, hint: 'Say whether it is insured' }
    ];
    // a house is its own location
    if (asset.category !== 'property') {
        checks.splice(4, 0, { id: 'location', label: 'Location', done: asset.location != null, hint: 'Say where it is kept' });
    }

    return {
        asset,
        category,
        valuations,
        latest,
        checks,
        done: checks.filter((c) => c.done).length,
        total: checks.length,
        identifier,
        documented: hasEstimate && (identifier != null || hasPurchase),
        covered: asset.insurance === 'insured' || asset.insurance === 'scheduled'
    };
}

export function buildPortfolio(data: PortfolioResponse): PortfolioItem[] {
    const byAsset = new Map<string, ValuationRecord[]>();
    for (const v of data.valuations) {
        const list = byAsset.get(v.assetId);
        if (list) list.push(v);
        else byAsset.set(v.assetId, [v]);
    }
    for (const list of byAsset.values()) {
        list.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.createdAt.localeCompare(b.createdAt));
    }
    return data.assets.map((a) => buildItem(a, byAsset.get(a.id) ?? []));
}

// ---------- values ----------

// the value of one asset for a value type, or null when it was never entered
export function valueOf(item: PortfolioItem, type: ValueType): number | null {
    if (type === 'cost_basis') return item.asset.purchasePriceCents;
    const v = item.latest[type];
    return v ? representativeCents(v) : null;
}

export function latestOf(item: PortfolioItem, type: ValueType): ValuationRecord | null {
    return type === 'cost_basis' ? null : item.latest[type];
}

// what we weigh insurance "pressure" by: replacement cost, or fair market when replacement is missing
export function protectionValue(item: PortfolioItem): number | null {
    return valueOf(item, 'replacement') ?? valueOf(item, 'fair_market');
}

export interface Totals {
    totalCents: number;
    counted: number;
    missing: number;
    of: number;
}

export function totalsFor(items: PortfolioItem[], type: ValueType): Totals {
    let totalCents = 0;
    let counted = 0;
    for (const item of items) {
        if (item.asset.currency !== 'USD') continue;
        const v = valueOf(item, type);
        if (v != null) {
            totalCents += v;
            counted++;
        }
    }
    return { totalCents, counted, missing: items.length - counted, of: items.length };
}

export interface GainLoss {
    valueCents: number;
    costCents: number;
    gainCents: number;
    ratio: number | null;
    counted: number;
}

// fair market minus cost basis, only over assets that have BOTH
export function gainLossFor(items: PortfolioItem[]): GainLoss {
    let valueCents = 0;
    let costCents = 0;
    let counted = 0;
    for (const item of items) {
        const v = valueOf(item, 'fair_market');
        const c = valueOf(item, 'cost_basis');
        if (v == null || c == null) continue;
        valueCents += v;
        costCents += c;
        counted++;
    }
    const gainCents = valueCents - costCents;
    return { valueCents, costCents, gainCents, ratio: costCents > 0 ? gainCents / costCents : null, counted };
}

export function itemGain(item: PortfolioItem): { gainCents: number; ratio: number | null } | null {
    const v = valueOf(item, 'fair_market');
    const c = valueOf(item, 'cost_basis');
    if (v == null || c == null) return null;
    return { gainCents: v - c, ratio: c > 0 ? (v - c) / c : null };
}

// ---------- allocation ----------

export interface Slice {
    key: string;
    label: string;
    valueCents: number;
    count: number;
    share: number;
    // css color var, follows the entity (category), never its rank
    color: string;
}

export function categoryColor(id: CategoryId | 'other'): string {
    const slot = id === 'other' ? null : getCategory(id).colorSlot;
    return slot ? `var(--color-series-${slot})` : 'var(--color-series-other)';
}

export function allocationByCategory(items: PortfolioItem[], type: ValueType): Slice[] {
    const map = new Map<CategoryId, { valueCents: number; count: number }>();
    for (const item of items) {
        const v = valueOf(item, type);
        if (v == null || v <= 0) continue;
        const cur = map.get(item.asset.category) ?? { valueCents: 0, count: 0 };
        cur.valueCents += v;
        cur.count++;
        map.set(item.asset.category, cur);
    }
    const total = [...map.values()].reduce((s, x) => s + x.valueCents, 0);
    return [...map.entries()]
        .map(([id, x]) => ({ key: id, label: getCategory(id).label, valueCents: x.valueCents, count: x.count, share: total ? x.valueCents / total : 0, color: categoryColor(id) }))
        .sort((a, b) => b.valueCents - a.valueCents);
}

export function allocationByLocation(items: PortfolioItem[], type: ValueType): Slice[] {
    const map = new Map<string, { valueCents: number; count: number }>();
    for (const item of items) {
        const v = valueOf(item, type);
        if (v == null || v <= 0) continue;
        const key = item.asset.category === 'property' ? 'Real estate (itself)' : (item.asset.location ?? 'Location not entered');
        const cur = map.get(key) ?? { valueCents: 0, count: 0 };
        cur.valueCents += v;
        cur.count++;
        map.set(key, cur);
    }
    const total = [...map.values()].reduce((s, x) => s + x.valueCents, 0);
    return [...map.entries()]
        .map(([key, x]) => ({ key, label: key, valueCents: x.valueCents, count: x.count, share: total ? x.valueCents / total : 0, color: 'var(--color-series-1)' }))
        .sort((a, b) => b.valueCents - a.valueCents);
}

// donut readability: at most 6 slices (top 5 + "Other"), shown in the fixed category order
export function foldSlices(slices: Slice[], max = 6): Slice[] {
    if (slices.length <= max) return orderByCategory(slices);
    const keep = slices.slice(0, max - 1);
    const rest = slices.slice(max - 1);
    const other: Slice = {
        key: '__other',
        label: `Other (${rest.length} categories)`,
        valueCents: rest.reduce((s, x) => s + x.valueCents, 0),
        count: rest.reduce((s, x) => s + x.count, 0),
        share: rest.reduce((s, x) => s + x.share, 0),
        color: 'var(--color-series-other)'
    };
    return [...orderByCategory(keep), other];
}

function orderByCategory(slices: Slice[]): Slice[] {
    const order = (k: string) => {
        const c = getCategory(k);
        return c.colorSlot ?? 99;
    };
    return [...slices].sort((a, b) => order(a.key) - order(b.key));
}

// ---------- history (step series from recorded observations only) ----------

export interface HistoryPoint {
    date: string;
    t: number;
    valueCents: number;
    assetsCounted: number;
}

export function portfolioHistory(items: PortfolioItem[], type: ValueType, today = todayIso()): HistoryPoint[] {
    // events: (date, assetId, value)
    const events: { date: string; assetId: string; cents: number }[] = [];
    for (const item of items) {
        if (type === 'cost_basis') {
            const c = item.asset.purchasePriceCents;
            if (c != null && item.asset.purchaseDate) events.push({ date: item.asset.purchaseDate, assetId: item.asset.id, cents: c });
            continue;
        }
        for (const v of item.valuations) {
            if (v.valueType !== type) continue;
            const cents = representativeCents(v);
            if (cents != null) events.push({ date: v.observedAt, assetId: item.asset.id, cents });
        }
    }
    if (events.length === 0) return [];
    events.sort((a, b) => a.date.localeCompare(b.date));

    const current = new Map<string, number>();
    const points: HistoryPoint[] = [];
    let i = 0;
    while (i < events.length) {
        const date = events[i].date;
        while (i < events.length && events[i].date === date) {
            current.set(events[i].assetId, events[i].cents);
            i++;
        }
        let sum = 0;
        for (const c of current.values()) sum += c;
        points.push({ date, t: parseIsoDate(date).getTime(), valueCents: sum, assetsCounted: current.size });
    }
    // carry the last value forward to today so the line reaches "now"
    const last = points[points.length - 1];
    if (last.date < today) points.push({ ...last, date: today, t: parseIsoDate(today).getTime() });
    return points;
}

// one asset's history for one value type
export function assetHistory(item: PortfolioItem, type: ObservedValueType, today = todayIso()): HistoryPoint[] {
    const points: HistoryPoint[] = [];
    for (const v of item.valuations) {
        if (v.valueType !== type) continue;
        const cents = representativeCents(v);
        if (cents == null) continue;
        const prev = points[points.length - 1];
        // two observations on the same day: the later one wins
        if (prev && prev.date === v.observedAt) prev.valueCents = cents;
        else points.push({ date: v.observedAt, t: parseIsoDate(v.observedAt).getTime(), valueCents: cents, assetsCounted: 1 });
    }
    const last = points[points.length - 1];
    if (last && last.date < today) points.push({ ...last, date: today, t: parseIsoDate(today).getTime() });
    return points;
}

// ---------- pressure gauge ----------
// "how much of what you own would be hard to prove or recover after a fire or flood?"

export type PressureLevel = 'low' | 'building' | 'high' | 'critical';

export interface Pressure {
    ratio: number | null;
    level: PressureLevel | null;
    totalCents: number;
    protectedCents: number;
    undocumentedCents: number;
    uncoveredCents: number;
    unvaluedCount: number;
}

export function pressureFor(items: PortfolioItem[]): Pressure {
    let protectedCents = 0;
    let undocumentedCents = 0;
    let uncoveredCents = 0;
    let unvaluedCount = 0;
    for (const item of items) {
        const v = protectionValue(item);
        if (v == null) {
            unvaluedCount++;
            continue;
        }
        if (!item.covered) uncoveredCents += v;
        else if (!item.documented) undocumentedCents += v;
        else protectedCents += v;
    }
    const totalCents = protectedCents + undocumentedCents + uncoveredCents;
    const ratio = totalCents > 0 ? (undocumentedCents + uncoveredCents) / totalCents : null;
    let level: PressureLevel | null = null;
    if (ratio != null) level = ratio < 0.25 ? 'low' : ratio < 0.5 ? 'building' : ratio < 0.75 ? 'high' : 'critical';
    return { ratio, level, totalCents, protectedCents, undocumentedCents, uncoveredCents, unvaluedCount };
}

// ---------- needs attention ----------

export type Severity = 'critical' | 'serious' | 'warning' | 'info';

export interface AttentionItem {
    id: string;
    severity: Severity;
    title: string;
    detail: string;
    assetId: string;
    assetName: string;
    weightCents: number;
}

const severityRank: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, info: 3 };

function addMonths(iso: string, months: number): string {
    const d = parseIsoDate(iso);
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function attentionFor(items: PortfolioItem[], today = todayIso()): AttentionItem[] {
    const out: AttentionItem[] = [];
    for (const item of items) {
        const { asset } = item;
        const value = protectionValue(item) ?? 0;
        const base = { assetId: asset.id, assetName: asset.name, weightCents: value };

        const fmv = item.latest.fair_market;
        const repl = item.latest.replacement;
        if (!fmv && !repl) {
            out.push({ ...base, id: `${asset.id}:value`, severity: 'warning', title: 'No current value', detail: 'Record a fair market or replacement value so it counts in your totals.' });
        } else {
            const newest = [fmv, repl].filter(Boolean).map((v) => v!.observedAt).sort().pop()!;
            const age = daysBetween(newest, today);
            if (age > 365) {
                out.push({ ...base, id: `${asset.id}:stale`, severity: 'info', title: 'Value is over a year old', detail: 'Prices move. Record a fresh estimate.' });
            }
        }

        if (!item.covered && value >= 100_000) {
            const title = asset.insurance === 'not_insured' ? 'Not insured' : 'Insurance not entered';
            out.push({ ...base, id: `${asset.id}:insurance`, severity: value >= 1_000_000 ? 'critical' : 'serious', title, detail: 'Worth $1,000 or more with no recorded coverage.' });
        }

        if (!item.identifier && value >= 500_000 && asset.category !== 'property') {
            out.push({ ...base, id: `${asset.id}:id`, severity: 'warning', title: 'No serial or ID', detail: 'Insurers and police rely on serial numbers to prove ownership.' });
        }

        const warranty = asset.details.warrantyExpires;
        if (typeof warranty === 'string') {
            const days = daysBetween(today, warranty);
            if (days >= 0 && days <= 60) {
                out.push({ ...base, id: `${asset.id}:warranty`, severity: 'warning', title: `Warranty ends in ${days} day${days === 1 ? '' : 's'}`, detail: 'Check for issues while it is still covered.' });
            }
        }

        const lastServiced = asset.details.lastServiced;
        const interval = asset.details.serviceIntervalMonths;
        if (typeof lastServiced === 'string' && typeof interval === 'number') {
            const due = addMonths(lastServiced, interval);
            if (due <= today) out.push({ ...base, id: `${asset.id}:service`, severity: 'warning', title: 'Service is due', detail: `Last serviced ${formatDate(lastServiced)}, due every ${interval} months.` });
        }
    }
    return out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.weightCents - a.weightCents);
}

// ---------- search ----------

export function searchTextOf(item: PortfolioItem): string {
    const { asset } = item;
    const parts = [asset.name, asset.brand, asset.model, asset.location, asset.serialNumber, asset.notes, item.category.label];
    for (const v of Object.values(asset.details)) if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
    return parts.filter(Boolean).join(' ').toLowerCase();
}

export function distinctLocations(items: PortfolioItem[]): string[] {
    const set = new Set<string>();
    for (const item of items) if (item.asset.location) set.add(item.asset.location);
    return [...set].sort((a, b) => a.localeCompare(b));
}
