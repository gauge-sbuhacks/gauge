// the landing page's product shot: a small, live preview of the dashboard built from the sample
// portfolio (not a picture), framed like a browser window. Gus sits on the window's top edge,
// clipboard in hand, having just inspected everything inside it.

import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Gus } from '@/components/brand/Mascots.tsx';
import { HistoryChart } from '@/components/charts/HistoryChart.tsx';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { formatMoney } from '@/lib/format.ts';
import { itemGain, portfolioHistory, totalsFor, valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

export function DashboardPreview({ items }: { items: PortfolioItem[] }) {
    const model = useMemo(() => {
        const totals = totalsFor(items, 'fair_market');
        const history = portfolioHistory(items, 'fair_market');
        const top = [...items].sort((a, b) => (valueOf(b, 'fair_market') ?? -1) - (valueOf(a, 'fair_market') ?? -1)).slice(0, 4);
        return { totals, history, top };
    }, [items]);

    return (
        <div className="relative mx-auto w-full max-w-[52rem]">
            {/* Gus, perched on the window's top edge, with a word about what he found */}
            <div aria-hidden className="pointer-events-none absolute right-4 bottom-full z-10 flex items-end gap-2 sm:right-8">
                <p className="relative mb-8 hidden rounded-lg border-[1.5px] border-[#8F4C2E] bg-ticket px-2.5 py-1 text-[11px] leading-snug font-medium whitespace-nowrap text-sbu-umber shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)] sm:block">
                    All {model.totals.of} items inspected.
                    <span className="absolute top-1/2 -right-[7px] size-3 -translate-y-1/2 rotate-45 border-t-[1.5px] border-r-[1.5px] border-[#8F4C2E] bg-ticket" />
                </p>
                <Gus pose="certify" size={72} className="-mb-[6px] h-auto w-16 sm:w-[72px]" />
            </div>

            <div className="overflow-hidden rounded-xl border border-border-strong/70 bg-card shadow-[0_30px_60px_-30px_rgba(0,0,0,0.75),var(--hairline-top)]">
                {/* window chrome */}
                <div className="flex items-center gap-3 border-b border-border bg-inset/70 px-3.5 py-2">
                    <span className="flex gap-1.5" aria-hidden>
                        <span className="size-2.5 rounded-full bg-[#AE3811]/80" />
                        <span className="size-2.5 rounded-full bg-[#F4A906]/80" />
                        <span className="size-2.5 rounded-full bg-[#68C2B3]/70" />
                    </span>
                    <span className="mx-auto rounded-md bg-card/70 px-3 py-0.5 text-xs text-subtle-foreground">gauge · sample portfolio</span>
                    <span className="w-[42px]" aria-hidden />
                </div>

                <div className="grid gap-5 p-4 text-left sm:p-5 md:grid-cols-[1.2fr_1fr]">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Fair market value</p>
                        <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl">{formatMoney(model.totals.totalCents)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {model.totals.counted} of {model.totals.of} assets valued
                        </p>
                        <div className="mt-3">
                            <HistoryChart points={model.history} height={132} />
                        </div>
                    </div>

                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Top assets</p>
                        <ul className="mt-2 divide-y divide-border">
                            {model.top.map((item) => {
                                const cents = valueOf(item, 'fair_market');
                                const gain = itemGain(item);
                                const up = gain != null && gain.gainCents >= 0;
                                return (
                                    <li key={item.asset.id} className="flex items-center gap-2.5 py-2">
                                        <CategoryBadgeIcon id={item.asset.category} className="size-8" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium">{item.asset.name}</p>
                                            <p className="text-[11px] text-muted-foreground">{item.category.label}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[13px] font-semibold tabular-nums">{cents == null ? 'Not entered' : formatMoney(cents)}</p>
                                            {gain && (
                                                <p className={cn('inline-flex items-center gap-0.5 text-[11px] tabular-nums', up ? 'text-gain' : 'text-loss')}>
                                                    {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                                                    {formatMoney(gain.gainCents, { signed: true, compact: true })}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
