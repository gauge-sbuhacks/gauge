import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { formatMoney } from '@/lib/format.ts';
import { liquiditySummary } from '@/lib/liquidity.ts';
import { valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
import { SellAssetButton } from '@/components/assets/SellAssetButton.tsx';

export function LiquidityDashboard({ items }: { items:PortfolioItem[] }) {
    const summary=liquiditySummary(items);
    const rows=[...summary.pairs].sort((a,b) => valueOf(b,'fair_market')!-valueOf(a,'fair_market')!).slice(0,6);
    const max=Math.max(1,...rows.flatMap(i => [valueOf(i,'fair_market')!,valueOf(i,'liquidation')!]));
    const maxGain=Math.max(1,...summary.gains.map(g => Math.abs(g.gain.gainCents)));
    return <section className="space-y-4" aria-label="Liquidity and resale">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">From ownership to opportunity</p><h2 className="mt-1 text-xl font-semibold tracking-tight">What could you realize?</h2></div><span className="text-xs text-muted-foreground">Recorded estimates · {summary.pairs.length} of {items.length} assets have both values</span></div>
        <div className="grid gap-3 sm:grid-cols-3">{[
            { label:'Market value', value:summary.pairs.length ? formatMoney(summary.marketCents) : 'Not enough data', note:'Matched assets with both recorded values' },
            { label:'Quick-sale estimate', value:summary.pairs.length ? formatMoney(summary.quickCents) : 'Not enough data', note:'The same assets, using recorded quick-sale values' },
            { label:'Market vs. quick-sale gap', value:summary.pairs.length ? formatMoney(summary.gapCents) : 'Not enough data', note:'Before fees and shipping; actual proceeds may differ' }
        ].map(v => <div key={v.label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{v.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{v.value}</p><p className="mt-2 text-xs text-muted-foreground">{v.note}</p></div>)}</div>
        <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Market vs. quick sale</CardTitle><CardDescription>Compare recorded values for the same assets. No sale timing is assumed.</CardDescription></CardHeader><CardContent>
                <div className="mb-4 flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-primary"/>Market</span><span className="flex items-center gap-2"><span className="size-2 rounded-sm bg-brass"/>Quick sale</span></div>
                {rows.length ? <ul className="space-y-4">{rows.map(i => <li key={i.asset.id}><div className="mb-2 flex items-center justify-between gap-2"><Link to={`/assets/${i.asset.id}#sell`} className="truncate text-sm font-medium hover:underline">{i.asset.name}</Link><span className="shrink-0 text-xs tabular-nums">{formatMoney(valueOf(i,'fair_market')!)} / {formatMoney(valueOf(i,'liquidation')!)}</span></div><div className="space-y-1" aria-hidden="true"><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width:`${valueOf(i,'fair_market')!/max*100}%` }}/></div><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-brass" style={{ width:`${valueOf(i,'liquidation')!/max*100}%` }}/></div></div></li>)}</ul> : <p className="py-8 text-center text-sm text-muted-foreground">Record market and quick-sale values to compare your options.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Gains and losses by asset</CardTitle><CardDescription>Fair market value minus purchase cost, where both are recorded.</CardDescription></CardHeader><CardContent>
                {summary.gains.length ? <ul className="space-y-4">{summary.gains.map(({ item,gain }) => <li key={item.asset.id}><div className="mb-2 flex justify-between gap-2 text-sm"><Link className="truncate hover:underline" to={`/assets/${item.asset.id}`}>{item.asset.name}</Link><span className={gain.gainCents >= 0 ? 'text-gain' : 'text-loss'}>{gain.gainCents>0 ? '+' : ''}{formatMoney(gain.gainCents)}</span></div><div className="relative flex h-2 rounded bg-muted" aria-hidden="true"><div className="w-1/2"/><div className="absolute top-0 bottom-0 left-1/2 w-px bg-muted-foreground/30"/><div className={`absolute h-2 rounded ${gain.gainCents>=0 ? 'bg-good' : 'bg-destructive'}`} style={{ width:`${Math.abs(gain.gainCents)/maxGain*50}%`, ...(gain.gainCents>=0 ? { left:'50%' } : { right:'50%' }) }}/></div></li>)}</ul> : <p className="py-8 text-center text-sm text-muted-foreground">Add purchase prices and market values to see gains and losses.</p>}
            </CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle>Start with a price check</CardTitle><CardDescription>{summary.needsResearch.length ? `${summary.needsResearch.length} assets have no market estimate or an estimate over six months old.` : 'Your recorded market estimates are up to date. You can research any asset before selling.'}</CardDescription></CardHeader><CardContent>
            <ul className="divide-y">{(summary.needsResearch.length ? summary.needsResearch : items).slice(0,5).map(i => <li key={i.asset.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><Link to={`/assets/${i.asset.id}#sell`} className="block truncate text-sm font-medium hover:underline">{i.asset.name}</Link><p className="mt-1 text-xs text-muted-foreground">{i.latest.fair_market ? `Market estimate from ${i.latest.fair_market.observedAt}` : 'No market estimate recorded'}</p></div><SellAssetButton id={i.asset.id}/></li>)}</ul>
            <Link to="/assets" className="mt-4 inline-flex items-center gap-1 text-xs font-medium hover:underline">Explore all assets <ArrowUpRight className="size-3"/></Link>
        </CardContent></Card>
    </section>;
}
