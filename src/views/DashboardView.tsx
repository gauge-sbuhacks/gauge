import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Boxes, Plus } from 'lucide-react';
import { VALUE_TYPE_SHORT, VALUE_TYPES, type ValueType } from '@shared/schemas.ts';
import { LiquidityDashboard } from '@/components/charts/LiquidityDashboard.tsx';
import { HistoryChart, clipHistory } from '@/components/charts/HistoryChart.tsx';
import { SellAssetButton } from '@/components/assets/SellAssetButton.tsx';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { Segmented } from '@/components/common/Segmented.tsx';
import { EmptyState, PageHeader } from '@/components/layout/PageHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { usePortfolio } from '@/hooks/usePortfolio.ts';
import { formatMoney, localDateIso } from '@/lib/format.ts';
import { portfolioHistory, totalsFor, valueOf } from '@/lib/portfolio.ts';

export default function DashboardView() {
    const { items, isLoading, error, refetch } = usePortfolio();
    const [params, setParams] = useSearchParams();
    const [yearStart] = useState(() => {const d=new Date();d.setFullYear(d.getFullYear()-1);return localDateIso(d);});
    const valueType = VALUE_TYPES.includes(params.get('view') as ValueType) ? params.get('view') as ValueType : 'fair_market';
    const range = params.get('range') === '1y' ? '1y' : 'all';
    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value) next.set(key,value); else next.delete(key);
        setParams(next,{replace:true});
    };
    const model = useMemo(() => {
        const all = items ?? [];
        return { totals:totalsFor(all,valueType), history:portfolioHistory(all,valueType),
            top:[...all].sort((a,b) => (valueOf(b,valueType) ?? -1) - (valueOf(a,valueType) ?? -1)).slice(0,6) };
    },[items,valueType]);
    if (isLoading) return <LoadingBlock label="Loading your portfolio"/>;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()}/>;
    const add = <Button asChild><Link to="/assets/new"><Plus/>Add asset</Link></Button>;
    if (!items?.length) return <div className="space-y-6"><PageHeader title="Portfolio"/><EmptyState icon={<Boxes className="size-8"/>} title="Start with something you own" description="Track its value and find the right place to sell." actions={add}/></div>;
    const {totals,history,top} = model;
    return <div className="space-y-6">
        <PageHeader title="Portfolio" description={`${items.length} asset${items.length===1?'':'s'}. Know their value. Find their next owner.`} actions={add}/>
        <Card>
            <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Segmented label="Value type" value={valueType} onChange={v => setParam('view',v==='fair_market'?null:v)} options={VALUE_TYPES.map(value => ({value,label:VALUE_TYPE_SHORT[value]}))}/>
                    <Segmented size="sm" label="Time range" value={range} onChange={v => setParam('range',v==='all'?null:v)} options={[{value:'1y',label:'1Y'},{value:'all',label:'All'}]}/>
                </div>
                <div>
                    <CardTitle className="text-4xl font-semibold tracking-tight sm:text-5xl">{totals.counted ? formatMoney(totals.totalCents) : 'No values yet'}</CardTitle>
                    <p className="mt-2 text-sm text-muted-foreground">{totals.counted} of {totals.of} assets valued{totals.missing > 0 && <> · <Link to={`/assets?missing=${valueType}`} className="underline underline-offset-4">{totals.missing} need a value</Link></>}</p>
                </div>
            </CardHeader>
            <CardContent>
                <HistoryChart points={clipHistory(history,range==='1y'?yearStart:null)} countLabel={n => `${n} assets valued`}/>
                <p className="mt-3 text-xs text-muted-foreground">{valueType==='cost_basis' ? 'Purchase prices by purchase date.' : 'Recorded portfolio values. Adding an asset also changes the total. Open an asset for its market history.'}</p>
            </CardContent>
        </Card>
        <LiquidityDashboard items={items} valueType={valueType}/>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Your assets</CardTitle><Button asChild variant="ghost" size="sm"><Link to="/assets">See all</Link></Button></CardHeader>
            <CardContent><ul className="divide-y">{top.map(item => {
                const cents=valueOf(item,valueType);
                return <li key={item.asset.id} className="flex items-center gap-3 py-3">
                    <Link to={`/assets/${item.asset.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-offset-4">
                        <CategoryBadgeIcon id={item.asset.category}/><div className="min-w-0"><p className="truncate text-sm font-medium">{item.asset.name}</p><p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{cents==null?'No value recorded':formatMoney(cents)}{item.asset.isSample?' · Test data':''}</p></div>
                    </Link><SellAssetButton id={item.asset.id}/>
                </li>;
            })}</ul></CardContent>
        </Card>
    </div>;
}
