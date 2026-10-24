// display formatting: money, dates, percents. "not entered" is handled by callers (null in, null out)
// so a missing value never quietly renders as $0.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

// $12,345 (whole dollars unless there are cents, and the amount is small enough that cents matter)
export function formatMoney(cents: number, opts: { compact?: boolean; signed?: boolean; exact?: boolean } = {}): string {
    const dollars = cents / 100;
    let s: string;
    if (opts.compact && Math.abs(dollars) >= 10_000) s = usdCompact.format(dollars);
    else if (opts.exact || (cents % 100 !== 0 && Math.abs(dollars) < 1000)) s = usd2.format(dollars);
    else s = usd0.format(dollars);
    if (opts.signed && cents > 0) s = `+${s}`;
    return s;
}

// axis ticks: $0, $250K, $1.2M
export function formatAxisMoney(cents: number): string {
    const d = cents / 100;
    if (d === 0) return '$0';
    if (Math.abs(d) >= 1000) return usdCompact.format(d);
    return usd0.format(d);
}

export function formatPercent(ratio: number, opts: { signed?: boolean; digits?: number } = {}): string {
    const digits = opts.digits ?? (Math.abs(ratio) < 0.1 ? 1 : 0);
    const s = `${(ratio * 100).toFixed(digits)}%`;
    return opts.signed && ratio > 0 ? `+${s}` : s;
}

// ---------- dates (YYYY-MM-DD strings, read as local calendar dates so they never shift a day) ----------

export function parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

export function formatDate(iso: string): string {
    return dateFmt.format(parseIsoDate(iso));
}

export function formatMonth(iso: string | number): string {
    return monthFmt.format(typeof iso === 'number' ? new Date(iso) : parseIsoDate(iso));
}

export function daysBetween(fromIso: string, toIso: string): number {
    return Math.round((parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime()) / 86_400_000);
}

// "3 months ago", "2 years ago", "today"
export function formatAge(iso: string, today = todayIso()): string {
    const days = daysBetween(iso, today);
    if (days <= 0) return days === 0 ? 'today' : 'in the future';
    if (days === 1) return 'yesterday';
    if (days < 31) return `${days} days ago`;
    const months = Math.round(days / 30.44);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.round((days / 365.25) * 10) / 10;
    return `${years % 1 === 0 ? years.toFixed(0) : years.toFixed(1)} year${years === 1 ? '' : 's'} ago`;
}

export function formatNumber(n: number, unit?: string): string {
    const s = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return unit ? `${s} ${unit}` : s;
}
