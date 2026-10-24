// allocation donut + its legend table. colors follow the category (never the rank), at most
// six slices (top five + other), and the legend doubles as the table view of the same numbers.

import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney, formatPercent } from '@/lib/format.ts';
import type { Slice } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { payload: Slice }[] }) {
    if (!active || !payload?.length) return null;
    const s = payload[0].payload;
    return (
        <div className="rounded-lg bg-popover px-3 py-2 text-sm shadow-md ring-1 ring-foreground/10">
            <div className="font-semibold tabular-nums">{formatMoney(s.valueCents)}</div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.label} · {formatPercent(s.share)}
            </div>
        </div>
    );
}

export function AllocationDonut({
    slices,
    totalCents,
    centerLabel,
    emptyText = 'No values recorded yet'
}: {
    slices: Slice[];
    totalCents: number;
    centerLabel: string;
    emptyText?: string;
}) {
    const [hovered, setHovered] = useState<string | null>(null);

    if (slices.length === 0) {
        return <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">{emptyText}</div>;
    }

    // legend reads best biggest-first; the ring keeps the fixed category order
    const legend = [...slices].sort((a, b) => b.valueCents - a.valueCents);

    return (
        <div className="grid items-center gap-6 sm:grid-cols-[13rem_1fr]">
            <div className="relative mx-auto aspect-square w-52 sm:w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={slices}
                            dataKey="valueCents"
                            nameKey="label"
                            innerRadius="70%"
                            outerRadius="100%"
                            startAngle={90}
                            endAngle={-270}
                            // the 2px surface-colored stroke is the gap between slices
                            stroke="var(--color-card)"
                            strokeWidth={2}
                            isAnimationActive={false}
                            onMouseEnter={(_d, i) => setHovered(slices[i]?.key ?? null)}
                            onMouseLeave={() => setHovered(null)}
                        >
                            {slices.map((s) => (
                                <Cell key={s.key} fill={s.color} fillOpacity={hovered && hovered !== s.key ? 0.3 : 1} />
                            ))}
                        </Pie>
                        <Tooltip content={<DonutTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-semibold tracking-tight">{formatMoney(totalCents, { compact: true })}</span>
                    <span className="max-w-[7rem] text-[11px] leading-tight text-muted-foreground">{centerLabel}</span>
                </div>
            </div>

            <table className="w-full text-sm">
                <thead className="sr-only">
                    <tr>
                        <th>Group</th>
                        <th>Value</th>
                        <th>Share</th>
                    </tr>
                </thead>
                <tbody>
                    {legend.map((s) => (
                        <tr
                            key={s.key}
                            onMouseEnter={() => setHovered(s.key)}
                            onMouseLeave={() => setHovered(null)}
                            className={cn('transition-opacity', hovered && hovered !== s.key && 'opacity-50')}
                        >
                            <td className="py-1.5 pr-2">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                                    <span className="truncate">{s.label}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{s.count}</span>
                                </span>
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(s.valueCents)}</td>
                            <td className="w-14 py-1.5 text-right tabular-nums text-muted-foreground">{formatPercent(s.share)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
