// horizontal bars for comparing a handful of totals (by location, by value type).
// one hue for every bar (it's magnitude, not identity), thin bars, value printed at the end.

import type { ReactNode } from 'react';
import { formatMoney } from '@/lib/format.ts';

export interface BarRow {
    key: string;
    label: ReactNode;
    valueCents: number | null;
    sub?: ReactNode;
    title?: string;
}

export function BarList({ rows, emptyText = 'Nothing to show yet' }: { rows: BarRow[]; emptyText?: string }) {
    const max = Math.max(0, ...rows.map((r) => r.valueCents ?? 0));
    if (rows.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">{emptyText}</div>;

    return (
        <ul className="space-y-3">
            {rows.map((r) => {
                const pct = r.valueCents != null && max > 0 ? Math.max(1.5, (r.valueCents / max) * 100) : 0;
                return (
                    <li key={r.key} title={r.title}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate">{r.label}</span>
                            <span className="shrink-0 tabular-nums">
                                {r.valueCents == null ? <span className="text-muted-foreground/80 italic">Not entered</span> : formatMoney(r.valueCents)}
                            </span>
                        </div>
                        <div className="h-2 rounded-sm bg-muted">
                            {pct > 0 && <div className="h-2 rounded-l-sm rounded-r-[4px] bg-series-1" style={{ width: `${pct}%` }} />}
                        </div>
                        {r.sub && <div className="mt-1 text-xs text-muted-foreground">{r.sub}</div>}
                    </li>
                );
            })}
        </ul>
    );
}
