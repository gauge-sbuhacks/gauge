// the landing page's explanatory diagrams. every number comes from the test portfolio run through
// the real portfolio math, so the page never shows a figure the app itself wouldn't.

import { useEffect, useState } from 'react';
import { ChevronRight, FileDown, Gauge, History, PackagePlus, type LucideIcon } from 'lucide-react';
import { INSURANCE_LABELS, VALUE_TYPE_HINTS, VALUE_TYPE_LABELS, type ValueType } from '@shared/schemas.ts';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { formatAge, formatMoney, formatMonth } from '@/lib/format.ts';
import { totalsFor, valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

// ---------- one asset, four values ----------

// short versions of VALUE_TYPE_HINTS that fit beside a bar (the full one is the tooltip)
const VALUE_ROWS: { type: ValueType; hint: string; bar: string }[] = [
    { type: 'cost_basis', hint: 'What you paid', bar: 'border border-dashed border-foreground/40' },
    { type: 'replacement', hint: 'To replace it today', bar: 'bg-brass' },
    { type: 'fair_market', hint: 'A fair private sale', bar: 'bg-primary' },
    { type: 'liquidation', hint: 'Selling it quickly', bar: 'bg-muted-foreground/45' }
];

export function AssetValuesDiagram({ item }: { item: PortfolioItem }) {
    // bars start empty and grow on the first frame, so they draw in when the page opens
    const [grown, setGrown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setGrown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const { asset } = item;
    const values = VALUE_ROWS.map((r) => valueOf(item, r.type));
    const max = Math.max(...values.map((v) => v ?? 0), 1);
    const history = item.valuations.filter((v) => v.valueType === 'fair_market' && v.amountCents != null);
    const meta = [item.category.label, asset.location, asset.insurance ? INSURANCE_LABELS[asset.insurance] : null].filter(Boolean).join(' · ');

    return (
        <figure className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
            <div className="flex items-center gap-3">
                <CategoryBadgeIcon id={asset.category} />
                <div className="min-w-0">
                    <div className="truncate font-semibold">{asset.name}</div>
                    <div className="truncate text-sm text-muted-foreground">{meta}</div>
                </div>
            </div>

            <dl className="mt-6 space-y-4">
                {VALUE_ROWS.map((row, i) => {
                    const cents = values[i];
                    return (
                        <div key={row.type} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3">
                            <dt className="min-w-0" title={VALUE_TYPE_HINTS[row.type]}>
                                <div className="text-sm font-medium">{VALUE_TYPE_LABELS[row.type]}</div>
                                <div className="text-xs text-muted-foreground">{row.hint}</div>
                            </dt>
                            <div className="h-2.5 rounded-sm bg-muted">
                                <div
                                    className={cn('h-full rounded-sm transition-[width] duration-1000 ease-out motion-reduce:transition-none', row.bar)}
                                    style={{ width: grown && cents != null ? `${(cents / max) * 100}%` : '0%', transitionDelay: `${150 + i * 120}ms` }}
                                />
                            </div>
                            <dd className="w-20 text-right text-sm font-medium tabular-nums">{cents == null ? 'Not entered' : formatMoney(cents)}</dd>
                        </div>
                    );
                })}
            </dl>

            {history.length > 1 && (
                <div className="mt-7 border-t pt-5">
                    <div className="text-sm font-medium">Fair market, as recorded</div>
                    <div className="relative mt-4">
                        <div className="absolute inset-x-1 top-[5px] h-px bg-border" />
                        <ol className="relative flex justify-between">
                            {history.map((v, i) => (
                                <li key={v.id} className={cn('flex flex-col gap-1', i === 0 ? 'items-start' : i === history.length - 1 ? 'items-end' : 'items-center')}>
                                    <span className={cn('size-2.5 rounded-full ring-4 ring-card', i === history.length - 1 ? 'bg-primary' : 'bg-muted-foreground/50')} />
                                    <span className="mt-1 text-xs font-medium tabular-nums">{formatMoney(v.amountCents!, { compact: true })}</span>
                                    <span className="text-[11px] text-muted-foreground">{formatMonth(v.observedAt)}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            )}

            <figcaption className="mt-6 text-xs text-muted-foreground">Four kinds of value, each kept separately and never added together.</figcaption>
        </figure>
    );
}

// ---------- how it works ----------

interface Step {
    icon: LucideIcon;
    title: string;
    text: string;
    example: string;
}

export function FlowDiagram({ items }: { items: PortfolioItem[] }) {
    const car = items.find((i) => i.asset.category === 'vehicle') ?? items[0];
    const carValue = car ? valueOf(car, 'fair_market') : null;
    const carValuedAt = car?.latest.fair_market?.observedAt;
    const totals = totalsFor(items, 'fair_market');

    const steps: Step[] = [
        {
            icon: PackagePlus,
            title: 'Record',
            text: 'Add an item with its serial or VIN, purchase date and price, where it is kept, and whether it is insured.',
            example: car ? `${car.asset.name}, ${car.asset.location ?? 'no location'}` : 'Your first item'
        },
        {
            icon: History,
            title: 'Value',
            text: 'Log fair market, replacement, or liquidation values. Each one is dated and kept, so history builds up on its own.',
            example: carValue != null && carValuedAt ? `Fair market ${formatMoney(carValue)}, ${formatAge(carValuedAt)}` : 'Fair market, dated today'
        },
        {
            icon: Gauge,
            title: 'Read',
            text: 'See totals per value type, allocation by category and room, value over time, and what needs attention.',
            example: `${formatMoney(totals.totalCents, { compact: true })} fair market, on ${totals.counted} of ${totals.of}`
        },
        {
            icon: FileDown,
            title: 'Export',
            text: 'Download a CSV, or a claim-ready PDF inventory with identifiers, purchase records, and current values.',
            example: `inventory.pdf, ${items.length} items`
        }
    ];

    return (
        <ol className="grid gap-10 md:grid-cols-4 md:gap-6">
            {steps.map((s, i) => (
                <li key={s.title} className="relative">
                    <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground">
                            <s.icon className="size-[18px]" strokeWidth={1.75} />
                        </span>
                        {i < steps.length - 1 && (
                            <span className="hidden flex-1 items-center md:flex" aria-hidden>
                                <span className="h-px flex-1 bg-foreground/15" />
                                <ChevronRight className="-ml-1.5 size-4 text-foreground/30" />
                            </span>
                        )}
                    </div>
                    <h3 className="mt-4 font-semibold">
                        <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                        {s.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                    <p className="mt-3 border-l-2 border-brass/60 pl-2.5 font-mono text-xs text-foreground/75">{s.example}</p>
                </li>
            ))}
        </ol>
    );
}
