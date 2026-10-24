// value over time from recorded observations. drawn as a step line, because a value holds
// until the next time someone records a new one (we don't invent the in-between).

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxisMoney, formatDate, formatMoney, formatMonth, parseIsoDate } from '@/lib/format.ts';
import type { HistoryPoint } from '@/lib/portfolio.ts';

function HistoryTooltip({ active, payload, countLabel }: { active?: boolean; payload?: { payload: HistoryPoint }[]; countLabel?: (n: number) => string }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
        <div className="rounded-lg bg-popover px-3 py-2 text-sm shadow-md ring-1 ring-foreground/10">
            <div className="font-semibold tabular-nums">{formatMoney(p.valueCents)}</div>
            <div className="text-muted-foreground">{formatDate(p.date)}</div>
            {countLabel && <div className="text-xs text-muted-foreground">{countLabel(p.assetsCounted)}</div>}
        </div>
    );
}

// ---------- axis helpers: round dollar ticks and calendar-aligned date ticks ----------

function niceStep(raw: number): number {
    if (raw <= 0) return 1;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const r = raw / mag;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
}

function valueTicks(lo: number, hi: number, count = 4): number[] {
    const step = niceStep((hi - lo) / count || hi / count || 100);
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = start; t <= end + step / 2; t += step) ticks.push(Math.round(t));
    return ticks;
}

const yearFmt = new Intl.DateTimeFormat('en-US', { year: 'numeric' });

function timeTicks(min: number, max: number): { ticks: number[]; format: (t: number) => string } {
    const start = new Date(min);
    const spanMonths = (max - min) / (30.44 * 86_400_000);
    // long ranges: one tick per january. shorter: every 3 months (or every month under half a year)
    const everyMonths = spanMonths > 30 ? 12 : spanMonths > 6 ? 3 : 1;
    const ticks: number[] = [];
    const d = new Date(start.getFullYear(), everyMonths === 12 ? 0 : Math.floor(start.getMonth() / everyMonths) * everyMonths, 1);
    while (d.getTime() <= max) {
        if (d.getTime() >= min) ticks.push(d.getTime());
        d.setMonth(d.getMonth() + everyMonths);
    }
    const format = everyMonths === 12 ? (t: number) => yearFmt.format(new Date(t)) : (t: number) => formatMonth(t);
    return { ticks, format };
}

// keep only points from `fromIso` on, carrying the value that was in effect at the cutoff
export function clipHistory(points: HistoryPoint[], fromIso: string | null): HistoryPoint[] {
    if (!fromIso || points.length === 0) return points;
    const before = points.filter((p) => p.date < fromIso);
    const after = points.filter((p) => p.date >= fromIso);
    const carry = before[before.length - 1];
    if (carry && (after.length === 0 || after[0].date !== fromIso)) {
        return [{ ...carry, date: fromIso, t: parseIsoDate(fromIso).getTime() }, ...after];
    }
    return after;
}

export function HistoryChart({
    points,
    baseline = 'zero',
    referenceCents,
    referenceLabel,
    countLabel,
    height = 260
}: {
    points: HistoryPoint[];
    baseline?: 'zero' | 'auto';
    referenceCents?: number | null;
    referenceLabel?: string;
    countLabel?: (n: number) => string;
    height?: number;
}) {
    const gradientId = useId().replace(/:/g, '');

    if (points.length === 0) {
        return (
            <div className="flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground" style={{ height }}>
                No recorded values for this view yet
            </div>
        );
    }

    // with an "auto" baseline we zoom in on the range, so a filled area would exaggerate; draw a line only
    const values = points.map((p) => p.valueCents).concat(referenceCents != null ? [referenceCents] : []);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.1, max * 0.02, 100);
    const yTicks = baseline === 'zero' ? valueTicks(0, max) : valueTicks(Math.max(0, min - pad), max + pad);
    const domain: [number, number] = [yTicks[0], yTicks[yTicks.length - 1]];
    const x = timeTicks(points[0].t, points[points.length - 1].t);

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity={0.16} />
                            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                    <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        ticks={x.ticks}
                        tickFormatter={x.format}
                        tick={{ fill: 'var(--color-chart-axis)', fontSize: 12 }}
                        axisLine={{ stroke: 'var(--color-chart-grid)' }}
                        tickLine={false}
                        minTickGap={24}
                        tickMargin={8}
                    />
                    <YAxis
                        domain={domain}
                        ticks={yTicks}
                        tickFormatter={formatAxisMoney}
                        tick={{ fill: 'var(--color-chart-axis)', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={62}
                    />
                    <Tooltip
                        cursor={{ stroke: 'var(--color-chart-axis)', strokeWidth: 1 }}
                        content={<HistoryTooltip countLabel={countLabel} />}
                        isAnimationActive={false}
                    />
                    {referenceCents != null && (
                        <ReferenceLine
                            y={referenceCents}
                            stroke="var(--color-chart-axis)"
                            strokeDasharray="4 4"
                            ifOverflow="extendDomain"
                            label={{ value: referenceLabel ?? '', position: 'insideTopLeft', fill: 'var(--color-chart-axis)', fontSize: 11 }}
                        />
                    )}
                    <Area
                        type="stepAfter"
                        dataKey="valueCents"
                        stroke="var(--color-series-1)"
                        strokeWidth={2}
                        fill={baseline === 'zero' ? `url(#${gradientId})` : 'transparent'}
                        dot={false}
                        activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--color-card)', fill: 'var(--color-series-1)' }}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
