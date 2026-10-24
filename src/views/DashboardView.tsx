// the portfolio dashboard. one filter row on top (value type + real estate) scopes every number below,
// and every total says what it is and how many assets it covers.

import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Boxes, FlaskConical, Plus, Scale, ShieldAlert, Wallet } from 'lucide-react';
import { VALUE_TYPE_HINTS, VALUE_TYPE_LABELS, VALUE_TYPE_SHORT, VALUE_TYPES, type ValueType } from '@shared/schemas.ts';
import { AllocationDonut } from '@/components/charts/AllocationDonut.tsx';
import { BarList } from '@/components/charts/BarList.tsx';
import { HistoryChart, clipHistory } from '@/components/charts/HistoryChart.tsx';
import { PressureBreakdown, PressureGauge } from '@/components/charts/PressureGauge.tsx';
import { AttentionList } from '@/components/common/AttentionList.tsx';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { Segmented } from '@/components/common/Segmented.tsx';
import { StatTile } from '@/components/common/StatTile.tsx';
import { TestDataMenu, useTestData } from '@/components/common/TestDataControls.tsx';
import { GainLoss } from '@/components/common/ValueDisplay.tsx';
import { EmptyState, PageHeader } from '@/components/layout/PageHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { usePortfolio } from '@/hooks/usePortfolio.ts';
import { formatDate, formatMoney, formatPercent, todayIso } from '@/lib/format.ts';
import {
    allocationByCategory,
    allocationByLocation,
    attentionFor,
    foldSlices,
    gainLossFor,
    portfolioHistory,
    pressureFor,
    totalsFor,
    valueOf
} from '@/lib/portfolio.ts';

type Range = '1y' | '3y' | '5y' | 'all';

function rangeStart(range: Range): string | null {
    if (range === 'all') return null;
    const years = range === '1y' ? 1 : range === '3y' ? 3 : 5;
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return d.toISOString().slice(0, 10);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DashboardView() {
    const { items, isLoading, error, refetch, isFetching } = usePortfolio();
    const [params, setParams] = useSearchParams();
    const { loadSample, busy: sampleBusy } = useTestData();

    const valueType = (VALUE_TYPES as readonly string[]).includes(params.get('view') ?? '') ? (params.get('view') as ValueType) : 'fair_market';
    const range = (['1y', '3y', '5y', 'all'].includes(params.get('range') ?? '') ? params.get('range') : 'all') as Range;
    const includeProperty = params.get('re') !== '0';

    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value == null) next.delete(key);
        else next.set(key, value);
        setParams(next, { replace: true });
    };

    const hasProperty = items?.some((i) => i.asset.category === 'property') ?? false;
    const scoped = useMemo(() => (items ?? []).filter((i) => includeProperty || i.asset.category !== 'property'), [items, includeProperty]);

    const model = useMemo(() => {
        const totals = totalsFor(scoped, valueType);
        const cost = totalsFor(scoped, 'cost_basis');
        const gain = gainLossFor(scoped);
        const pressure = pressureFor(scoped);
        const slices = foldSlices(allocationByCategory(scoped, valueType));
        const locations = allocationByLocation(scoped, valueType).slice(0, 6);
        const history = portfolioHistory(scoped, valueType);
        const attention = attentionFor(scoped);
        const byType = VALUE_TYPES.map((t) => ({ type: t, ...totalsFor(scoped, t) }));
        const top = scoped
            .map((i) => ({ item: i, cents: valueOf(i, valueType) }))
            .filter((x): x is { item: typeof x.item; cents: number } => x.cents != null)
            .sort((a, b) => b.cents - a.cents)
            .slice(0, 6);
        const incomplete = scoped.filter((i) => i.done < i.total).length;
        return { totals, cost, gain, pressure, slices, locations, history, attention, byType, top, incomplete };
    }, [scoped, valueType]);

    if (isLoading) return <LoadingBlock label="Loading your portfolio" />;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

    if (!items || items.length === 0) {
        return (
            <div className="space-y-6">
                <PageHeader title="Portfolio" description="Everything you own, valued in one place." />
                <EmptyState
                    icon={<Boxes className="size-8" />}
                    title="Nothing here yet"
                    description="Add your first belonging by hand, or load the test portfolio (a 2020 Cadillac XT6, 89 Carnation Road, and 8 more) to see how the dashboard works."
                    actions={
                        <>
                            <Button variant="outline" onClick={loadSample} disabled={sampleBusy}>
                                <FlaskConical data-icon="inline-start" />
                                Load test data
                            </Button>
                            <Button asChild>
                                <Link to="/assets/new">
                                    <Plus data-icon="inline-start" />
                                    Add an asset
                                </Link>
                            </Button>
                        </>
                    }
                />
            </div>
        );
    }

    const { totals, cost, gain, pressure, slices, locations, history, attention, byType, top, incomplete } = model;
    const typeLabel = VALUE_TYPE_LABELS[valueType];
    const typeShort = VALUE_TYPE_SHORT[valueType].toLowerCase();
    const shown = clipHistory(history, rangeStart(range));
    const atRisk = pressure.undocumentedCents + pressure.uncoveredCents;

    const rangePicker = (
        <Segmented
            size="sm"
            label="Time range"
            value={range}
            onChange={(v) => setParam('range', v === 'all' ? null : v)}
            options={[
                { value: '1y', label: '1Y' },
                { value: '3y', label: '3Y' },
                { value: '5y', label: '5Y' },
                { value: 'all', label: 'All' }
            ]}
        />
    );

    return (
        <div className={`space-y-6 transition-opacity ${isFetching ? 'opacity-90' : ''}`}>
            <PageHeader
                title="Portfolio"
                description={`${plural(scoped.length, 'asset')}${includeProperty ? '' : ', real estate hidden'}. Values are estimates, not appraisals.`}
                actions={
                    <>
                        <TestDataMenu />
                        <Button asChild>
                            <Link to="/assets/new">
                                <Plus data-icon="inline-start" />
                                Add asset
                            </Link>
                        </Button>
                    </>
                }
            />

            {/* the one filter row. everything below follows it */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Segmented
                    label="Value type"
                    value={valueType}
                    onChange={(v) => setParam('view', v === 'fair_market' ? null : v)}
                    options={VALUE_TYPES.map((t) => ({ value: t, label: VALUE_TYPE_SHORT[t], title: VALUE_TYPE_HINTS[t] }))}
                />
                {hasProperty && (
                    <div className="flex items-center gap-2">
                        <Switch id="include-re" checked={includeProperty} onCheckedChange={(on) => setParam('re', on ? null : '0')} />
                        <Label htmlFor="include-re" className="text-sm font-normal">
                            Include real estate
                        </Label>
                    </div>
                )}
            </div>

            {/* hero: the one big number, and how it got here */}
            <Card>
                {/* plain flex instead of the card header grid, so phones stack it cleanly */}
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <CardDescription>{typeLabel}</CardDescription>
                        <CardTitle className="text-4xl font-semibold tracking-tight sm:text-5xl">{formatMoney(totals.totalCents)}</CardTitle>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            <span>
                                Across {totals.counted} of {plural(totals.of, 'asset')}
                                {totals.missing > 0 && (
                                    <>
                                        {'. '}
                                        <Link to={`/assets?missing=${valueType}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                                            {totals.missing} not entered
                                        </Link>
                                    </>
                                )}
                            </span>
                            {valueType === 'fair_market' && gain.counted > 0 && (
                                <span>
                                    <GainLoss cents={gain.gainCents} ratio={gain.ratio} /> vs. cost basis on {plural(gain.counted, 'asset')}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="shrink-0">{rangePicker}</div>
                </CardHeader>
                <CardContent>
                    <HistoryChart points={shown} countLabel={(n) => `${plural(n, 'asset')} with a recorded ${typeShort} value`} />
                    <p className="mt-2 text-xs text-muted-foreground">
                        {valueType === 'cost_basis'
                            ? 'Cumulative purchase prices by purchase date.'
                            : 'Sum of the latest recorded values over time. It steps up when you record a value or add an asset, so not every rise is a price change.'}
                    </p>
                </CardContent>
            </Card>

            {/* kpi row */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                    label="Cost basis"
                    icon={<Wallet className="size-4" />}
                    value={formatMoney(cost.totalCents)}
                    sub={`What you paid, on ${cost.counted} of ${plural(cost.of, 'asset')}`}
                />
                <StatTile
                    label="Unrealized gain or loss"
                    icon={<Scale className="size-4" />}
                    value={gain.counted ? <GainLoss cents={gain.gainCents} showIcon={false} className="font-semibold" /> : <span className="text-muted-foreground">Not enough data</span>}
                    sub={gain.counted ? `Fair market minus cost basis, on ${plural(gain.counted, 'asset')} with both` : 'Needs a purchase price and a fair market value'}
                />
                <StatTile
                    label="Assets"
                    icon={<Boxes className="size-4" />}
                    value={scoped.length}
                    sub={
                        incomplete > 0 ? (
                            <Link to="/assets?status=incomplete" className="underline-offset-4 hover:underline">
                                {incomplete} with incomplete records
                            </Link>
                        ) : (
                            'Every record is complete'
                        )
                    }
                />
                <StatTile
                    label="Value at risk"
                    icon={<ShieldAlert className="size-4" />}
                    value={formatMoney(atRisk)}
                    sub={pressure.totalCents ? `${formatPercent(pressure.ratio ?? 0)} of value is uninsured or missing proof` : 'Add values to measure'}
                />
            </div>

            {/* allocation + pressure */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Card>
                    <CardHeader>
                        <CardTitle>Allocation by category</CardTitle>
                        <CardDescription>
                            Share of {typeLabel.toLowerCase()}
                            {totals.missing > 0 ? `. ${totals.missing} asset${totals.missing === 1 ? '' : 's'} without one ${totals.missing === 1 ? 'is' : 'are'} left out.` : '.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AllocationDonut slices={slices} totalCents={totals.totalCents} centerLabel={VALUE_TYPE_SHORT[valueType]} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Pressure</CardTitle>
                        <CardDescription>How much of your value would be hard to prove or recover after a fire or flood.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <PressureGauge pressure={pressure} />
                        <PressureBreakdown pressure={pressure} />
                        <p className="text-xs text-muted-foreground">Weighted by replacement cost, or fair market value when replacement isn't entered.</p>
                    </CardContent>
                </Card>
            </div>

            {/* value types + locations */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Four ways to value it</CardTitle>
                        <CardDescription>Each value type is totaled separately. They are never added together.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BarList
                            rows={byType.map((t) => ({
                                key: t.type,
                                label: (
                                    <span className={t.type === valueType ? 'font-medium' : ''}>
                                        {VALUE_TYPE_LABELS[t.type]}
                                        {t.type === valueType && <span className="ml-1.5 text-xs text-muted-foreground">(showing)</span>}
                                    </span>
                                ),
                                valueCents: t.counted ? t.totalCents : null,
                                sub: `${VALUE_TYPE_HINTS[t.type]}. On ${t.counted} of ${t.of}.`
                            }))}
                        />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Where it's kept</CardTitle>
                        <CardDescription>{typeLabel} by location</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BarList
                            rows={locations.map((l) => ({
                                key: l.key,
                                label: (
                                    <span>
                                        {l.label} <span className="text-xs text-muted-foreground">{l.count}</span>
                                    </span>
                                ),
                                valueCents: l.valueCents,
                                title: `${formatPercent(l.share)} of the total`
                            }))}
                            emptyText="No locations with values yet"
                        />
                    </CardContent>
                </Card>
            </div>

            {/* top holdings + attention */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Top holdings</CardTitle>
                        <CardDescription>By {typeLabel.toLowerCase()}</CardDescription>
                        <CardAction>
                            <Button asChild variant="ghost" size="sm">
                                <Link to="/assets">See all</Link>
                            </Button>
                        </CardAction>
                    </CardHeader>
                    <CardContent>
                        {top.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No {typeShort} values recorded yet.</p>
                        ) : (
                            <ul className="-mx-2">
                                {top.map(({ item, cents }) => {
                                    const share = totals.totalCents ? cents / totals.totalCents : 0;
                                    return (
                                        <li key={item.asset.id}>
                                            <Link to={`/assets/${item.asset.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                                                <CategoryBadgeIcon id={item.asset.category} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{item.asset.name}</div>
                                                    <div className="mt-1 h-1.5 rounded-sm bg-muted">
                                                        <div className="h-1.5 rounded-l-sm rounded-r-[4px] bg-series-1" style={{ width: `${Math.max(1.5, share * 100)}%` }} />
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm tabular-nums">{formatMoney(cents)}</div>
                                                    <div className="text-xs text-muted-foreground tabular-nums">{formatPercent(share)}</div>
                                                </div>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Needs attention</CardTitle>
                        <CardDescription>
                            {attention.length === 0 ? 'All clear' : `${plural(attention.length, 'thing')} to look at, most important first`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <AttentionList items={attention} limit={7} />
                    </CardContent>
                </Card>
            </div>

            <p className="pb-4 text-center text-xs text-muted-foreground">
                As of {formatDate(todayIso())}. Estimates you record are not appraisals and do not prove authenticity.
            </p>
        </div>
    );
}
