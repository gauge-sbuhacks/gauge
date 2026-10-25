// depreciation for one vehicle: what it has lost since purchase (per year, per mile) and a five
// year projection. the projection is labeled as one everywhere it shows.

import type { ReactNode } from 'react';
import { GainLoss } from '@/components/common/ValueDisplay.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { vehicleDepreciation, type Depreciation } from '@/lib/depreciation.ts';
import { formatDate, formatMoney, formatMonth, formatPercent } from '@/lib/format.ts';
import type { PortfolioItem } from '@/lib/portfolio.ts';

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
    return (
        <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
    );
}

// 48¢ under a dollar, $1.20 above
const perMile = (cents: number) => (Math.abs(cents) < 100 ? `${Math.round(Math.abs(cents))}¢` : formatMoney(Math.round(Math.abs(cents)), { exact: true }));

const yearsText = (years: number) => (years < 1 ? `${Math.round(years * 12)} months` : `${years.toFixed(1).replace(/\.0$/, '')} years`);

export function DepreciationCard({ item }: { item: PortfolioItem }) {
    const result = vehicleDepreciation(item);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Depreciation</CardTitle>
                <CardDescription>Worked out from the purchase price, mileage, and latest fair market value you recorded.</CardDescription>
            </CardHeader>
            <CardContent>
                {result.status === 'missing' ? (
                    <p className="text-sm text-muted-foreground">Add the {result.missing.join(', ')} (Edit, or Record a value) to see how much this car has lost.</p>
                ) : (
                    <DepreciationBody d={result.value} />
                )}
            </CardContent>
        </Card>
    );
}

function DepreciationBody({ d }: { d: Depreciation }) {
    const lost = d.changeCents < 0;
    const last = d.projection[d.projection.length - 1];

    return (
        <div className="space-y-6">
            <div>
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <GainLoss cents={d.changeCents} ratio={d.changeRatio} className="text-xl" />
                    <span className="text-muted-foreground">
                        in {yearsText(d.years)}: {formatMoney(d.purchaseCents)} on {formatDate(d.purchaseDate)} to {formatMoney(d.currentCents)} on {formatDate(d.currentDate)}
                    </span>
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat
                    label={lost ? 'Lost per year' : 'Gained per year'}
                    value={d.lossPerYearCents != null ? formatMoney(Math.abs(d.lossPerYearCents)) : '—'}
                    sub={d.lossPerYearCents != null ? 'Straight-line average since purchase' : 'Needs at least 6 months of history'}
                />
                <Stat
                    label="Yearly rate"
                    value={d.annualRate != null ? formatPercent(Math.abs(d.annualRate), { digits: 1 }) : '—'}
                    sub={d.annualRate != null ? `Compounded, ${d.annualRate >= 0 ? 'lost' : 'gained'} each year` : 'Needs at least 6 months of history'}
                />
                <Stat
                    label={lost ? 'Cost per mile' : 'Per mile'}
                    value={d.lossPerMileCents != null ? perMile(d.lossPerMileCents) : '—'}
                    sub={d.milesDriven != null ? `Over ${d.milesDriven.toLocaleString('en-US')} miles driven` : 'Add the mileage now and when bought'}
                />
            </div>

            <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">Projected fair market value</p>
                    <span className="rounded-sm border border-dashed px-1.5 py-0.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Projection</span>
                </div>
                <ol className="grid grid-cols-5 gap-2">
                    {d.projection.map((p) => (
                        <li key={p.date} className="rounded-md border border-dashed p-2 text-center">
                            <p className="text-xs text-muted-foreground">{formatMonth(p.date)}</p>
                            <p className="text-sm font-medium tabular-nums">{formatMoney(p.valueCents, { compact: true })}</p>
                        </li>
                    ))}
                </ol>
                <p className="text-xs text-muted-foreground">
                    Not a valuation. Assumes it keeps losing {formatPercent(d.projectionRate, { digits: 1 })} a year,{' '}
                    {d.projectionBasis === 'own'
                        ? 'the rate it has averaged since you bought it.'
                        : 'a common rule of thumb for a car this age, since its own history is too short or unusual to extend.'}{' '}
                    That would put it near {formatMoney(last.valueCents)} by {formatMonth(last.date)}.
                </p>
            </div>
        </div>
    );
}
