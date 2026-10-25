import { useState } from 'react';
import { Link } from 'react-router';
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { historyKind } from '@shared/history.ts';
import { HistoryChart } from '@/components/charts/HistoryChart.tsx';
import { Segmented } from '@/components/common/Segmented.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { useAssetHistory } from '@/hooks/useAssetHistory.ts';
import { formatDate, formatMoney, parseIsoDate } from '@/lib/format.ts';
import type { PortfolioItem } from '@/lib/portfolio.ts';
import { ValuationHistory } from './ValuationHistory.tsx';

export function AssetHistory({ item, onRecord }: { item: PortfolioItem; onRecord: () => void }) {
    const history = useAssetHistory(item.asset.id);
    const [tab, setTab] = useState<'recorded' | 'market'>('recorded');
    const [selected, setSelected] = useState('');
    const [range, setRange] = useState<'1m' | '3m' | '1y' | 'all'>('all');
    const [now] = useState(() => Date.now());
    const data = history.data;
    const series = data?.series.find(s => s.id === selected) ?? data?.series[0];
    const canShowMarket = !!historyKind(item.asset) || !!data?.series.length;
    const kind = historyKind(item.asset);
    const latest = series?.points.at(-1);
    const cutoff = range === 'all' ? null : new Date(now - ({'1m':30,'3m':90,'1y':365}[range]) * 86400000).toISOString().slice(0,10);
    const points = (series?.points ?? []).filter(p => !cutoff || p.date >= cutoff).map(p => ({...p, t:parseIsoDate(p.date).getTime(), assetsCounted:1}));

    return <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Value history</CardTitle>
            <Button variant="outline" size="sm" onClick={onRecord}><Plus/>Record a value</Button>
        </CardHeader>
        <CardContent className="space-y-4">
            {canShowMarket && <Segmented label="History source" value={tab} onChange={setTab} options={[{value:'recorded',label:'Your values'},{value:'market',label:'Market history'}]}/>}
            {tab === 'recorded' || !canShowMarket ? <ValuationHistory item={item}/> : <>
                {history.isPending && <p className="text-sm text-muted-foreground">Loading saved history…</p>}
                {history.isError && <div className="flex flex-wrap items-center gap-3 text-sm"><p role="alert">Couldn’t load saved history.</p><Button size="sm" variant="outline" onClick={() => history.refetch()}>Try again</Button></div>}
                {data && <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            {series && <p className="text-sm font-medium">{series.label}{latest && <span className="ml-2 tabular-nums">{formatMoney(latest.valueCents)}</span>}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">{data.message}</p>
                        </div>
                        {kind === 'metal' && data.status !== 'needs_key' && data.status !== 'needs_details' && <Button size="sm" variant="outline" onClick={() => history.refresh.mutate()} disabled={history.refresh.isPending}>
                            {history.refresh.isPending ? <LoaderCircle className="animate-spin"/> : <RefreshCw/>}{series ? 'Update history' : 'Load history'}
                        </Button>}
                    </div>
                    {series && <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            {data.series.length > 1 && <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">Source
                                <select className="min-w-0 max-w-64 rounded-md border bg-card p-2 text-foreground" value={series.id} onChange={e => setSelected(e.target.value)}>{data.series.map(s => <option value={s.id} key={s.id}>{s.label}</option>)}</select>
                            </label>}
                            <Segmented size="sm" label="Market history range" value={range} onChange={setRange} options={[{value:'1m',label:'1M'},{value:'3m',label:'3M'},{value:'1y',label:'1Y'},{value:'all',label:'All'}]}/>
                        </div>
                        {points.length ? <HistoryChart points={points} baseline="auto" curve="linear" height={240}/> : <p className="py-12 text-center text-sm text-muted-foreground">No observations in this period. Choose a wider range.</p>}
                        {latest && <p className="text-xs text-muted-foreground"><a href={series.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{series.source}</a> · Latest price {formatDate(latest.date)} · Loaded {formatDate(series.fetchedAt.slice(0,10))}</p>}
                        <p className="text-xs leading-relaxed text-muted-foreground">{series.note}</p>
                        {points.length === 1 && <p className="text-xs text-muted-foreground">One observation so far. Research again another day to build a history.</p>}
                    </>}
                    {data.status === 'needs_details' && <Button asChild size="sm" variant="outline"><Link to={`/assets/${item.asset.id}/edit`}>Add matching details</Link></Button>}
                    {(data.status === 'needs_key' || (kind === 'magic' && data.status === 'not_loaded')) && <Button asChild size="sm" variant="outline"><Link to="/settings">View history setup</Link></Button>}
                </>}
                {history.refresh.isError && <p role="alert" className="text-sm text-destructive">{history.refresh.error.message}</p>}
            </>}
        </CardContent>
    </Card>;
}
