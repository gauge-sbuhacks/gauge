import { Link } from 'react-router';
import { VALUE_TYPE_SHORT, type ValueType } from '@shared/schemas.ts';
import { AllocationDonut } from '@/components/charts/AllocationDonut.tsx';
import { GainLoss } from '@/components/common/ValueDisplay.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { formatMoney } from '@/lib/format.ts';
import { liquiditySummary } from '@/lib/liquidity.ts';
import { allocationByCategory, foldSlices, gainLossFor, totalsFor, valueOf, type PortfolioItem } from '@/lib/portfolio.ts';

// Keep three useful comparisons without repeating the portfolio's total-value history.
export function LiquidityDashboard({ items, valueType = 'fair_market' }: { items: PortfolioItem[]; valueType?: ValueType }) {
    const summary = liquiditySummary(items);
    const gain = gainLossFor(items);
    const allocation = foldSlices(allocationByCategory(items, valueType));
    const allocatedCents = allocation.reduce((total, slice) => total + slice.valueCents, 0);
    const totals = totalsFor(items, valueType);
    const rows = [...summary.pairs].sort((a, b) => valueOf(b, 'fair_market')! - valueOf(a, 'fair_market')!).slice(0, 5);
    const gains = summary.gains.slice(0, 5);
    const maxValue = Math.max(1, ...rows.flatMap(item => [valueOf(item, 'fair_market')!, valueOf(item, 'liquidation')!]));
    const maxGain = Math.max(1, ...gains.map(row => Math.abs(row.gain.gainCents)));

    return <section className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-label="Asset performance and selling insights">
        <Card className="min-w-0" aria-label="Gains and losses by asset">
            <CardHeader>
                <CardTitle>Gains & losses</CardTitle>
                <CardDescription>Market estimates compared with what you paid.</CardDescription>
                {gain.counted > 0 && <p className="mt-2 text-xl font-semibold tracking-tight"><GainLoss cents={gain.gainCents} ratio={gain.ratio}/></p>}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                {gains.length ? <>
                    <ul className="space-y-4">{gains.map(({ item, gain: change }) => <li key={item.asset.id}>
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                            <Link to={`/assets/${item.asset.id}`} title={item.asset.name} className="min-w-0 truncate font-medium hover:underline">{item.asset.name}</Link>
                            <span className={`shrink-0 tabular-nums ${change.gainCents > 0 ? 'text-gain' : change.gainCents < 0 ? 'text-loss' : 'text-muted-foreground'}`}>{formatMoney(change.gainCents, { signed: true })}</span>
                        </div>
                        <div className="relative h-2 rounded bg-muted" aria-hidden="true">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/40"/>
                            {change.gainCents !== 0 && <div className={`absolute h-2 rounded ${change.gainCents > 0 ? 'bg-good' : 'bg-destructive'}`} style={{width:`${Math.abs(change.gainCents)/maxGain*50}%`,...(change.gainCents>0?{left:'50%'}:{right:'50%'})}}/>}
                        </div>
                    </li>)}</ul>
                    <div className="flex justify-between text-[11px] text-muted-foreground" aria-hidden="true"><span>Depreciation</span><span>Appreciation</span></div>
                    <p className="mt-auto text-xs text-muted-foreground">{gain.counted} of {items.length} assets have both values{gain.counted > gains.length ? ` · Top ${gains.length} changes shown` : ''}. Unrealized, before selling costs.</p>
                </> : <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><p>Add a purchase price and market value to see appreciation or depreciation.</p><Link to="/assets" className="font-medium text-foreground underline underline-offset-4">Add values</Link></div>}
            </CardContent>
        </Card>

        <Card className="min-w-0" aria-label="Asset category breakdown">
            <CardHeader><CardTitle>Value by category</CardTitle><CardDescription>Where your {VALUE_TYPE_SHORT[valueType].toLowerCase()} value sits.</CardDescription></CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                <AllocationDonut compact slices={allocation} totalCents={allocatedCents} centerLabel={VALUE_TYPE_SHORT[valueType]} emptyText="Add a positive value to see your category breakdown."/>
                <p className="mt-auto text-xs text-muted-foreground">{totals.counted} of {items.length} assets valued. Only positive recorded values appear in the chart.</p>
            </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2 xl:col-span-1" aria-label="Market versus quick-sale comparison">
            <CardHeader>
                <CardTitle>Market vs. quick sale</CardTitle>
                <CardDescription>Two recorded estimates for the same assets.</CardDescription>
                {summary.pairs.length > 0 && <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">{formatMoney(summary.quickCents)}<span className="ml-2 text-xs font-normal text-muted-foreground">quick-sale estimate</span></p>}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
                {rows.length ? <>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary"/>Market</span><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brass"/>Quick sale</span></div>
                    <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1">{rows.map(item => <li className="min-w-0" key={item.asset.id}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                            <Link to={`/assets/${item.asset.id}#sell`} title={item.asset.name} className="min-w-0 truncate font-medium hover:underline">{item.asset.name}</Link>
                            <span className="shrink-0 text-muted-foreground tabular-nums"><span className="sr-only">Market </span>{formatMoney(valueOf(item, 'fair_market')!)} / <span className="sr-only">Quick sale </span>{formatMoney(valueOf(item, 'liquidation')!)}</span>
                        </div>
                        <div className="space-y-1" aria-hidden="true"><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{width:`${valueOf(item,'fair_market')!/maxValue*100}%`}}/></div><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-brass" style={{width:`${valueOf(item,'liquidation')!/maxValue*100}%`}}/></div></div>
                    </li>)}</ul>
                    <p className="mt-auto text-xs text-muted-foreground">{summary.pairs.length} of {items.length} assets have both estimates{summary.pairs.length>rows.length?` · Top ${rows.length} by market value shown`:''}. Before fees and shipping; sale timing isn't predicted.</p>
                </> : <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><p>Record a quick-sale and market estimate for the same asset to compare them.</p><Link to="/assets?missing=liquidation" className="font-medium text-foreground underline underline-offset-4">Add quick-sale values</Link></div>}
            </CardContent>
        </Card>
    </section>;
}
