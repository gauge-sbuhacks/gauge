import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Check, Copy, LoaderCircle, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listingDraft, sellingPlatforms } from '@shared/marketplace.ts';
import { parseMoneyInput } from '@shared/money.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { useProfile } from '@/hooks/useProfile.ts';
import { useMarketResearch } from '@/hooks/useMarketResearch.ts';
import { useAddValuation } from '@/hooks/usePortfolio.ts';
import { formatMoney, localDateIso } from '@/lib/format.ts';
import { valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
import { PlatformLogo } from './PlatformLogo.tsx';

export function SellingPanel({ item }: { item: PortfolioItem }) {
    const profile=useProfile();
    const research=useMarketResearch(item.asset.id);
    const addValue=useAddValuation(item.asset.id);
    const [costs,setCosts]=useState('');
    const [copied,setCopied]=useState(false);
    const [now]=useState(() => Date.now());
    const report=research.data?.report;
    const range=report?.askingRange;
    const location=profile.data?.profile?.marketLocation ?? null;
    const platforms=sellingPlatforms(item.asset,location);
    const parsedCosts=parseMoneyInput(costs);
    const net=range && parsedCosts != null ? range.medianCents-parsedCosts : null;
    const stale=report && now-Date.parse(report.researchedAt)>24*60*60*1000;
    const copy=async () => {
        try {
            await navigator.clipboard.writeText(listingDraft(item.asset,range?.medianCents ?? valueOf(item,'fair_market')));
            setCopied(true); toast.success('Listing draft copied. Review the details and add photos before posting.');
        } catch { toast.error('Clipboard unavailable. Copy your item details from this page.'); }
    };
    const record=() => {
        if (!range || !report) return;
        addValue.mutate({ valueType:'fair_market', amountCents:range.medianCents, lowCents:range.lowCents, highCents:range.highCents,
            currency:'USD', observedAt:localDateIso(new Date(report.researchedAt)), source:'provider', sourceName:'eBay active asking prices',
            notes:`Estimate from ${range.count} relevant active listings. Asking prices, not completed sales. Researched ${report.researchedAt}.` },
            { onSuccess:() => toast.success('Market estimate recorded'), onError:err => toast.error(err.message) });
    };


    const supportsResearch = !['property','vehicle'].includes(item.asset.category);
    return <Card id="sell" className="scroll-mt-6">
        <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Sell this item</CardTitle>
                {supportsResearch && <Button size="sm" variant="outline" onClick={() => research.refresh.mutate()} disabled={research.refresh.isPending || research.isPending}>{research.refresh.isPending?<LoaderCircle className="animate-spin"/>:<Search/>}{report?'Update prices':'Compare prices'}</Button>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5"/>{location?`${location.city}, ${location.region}`:'Add a location for local results'}<Link to="/onboarding?edit" className="underline underline-offset-4">{location?'Change':'Set location'}</Link></div>
        </CardHeader>
        <CardContent className="space-y-4">
            {range && <div className="rounded-lg bg-muted/40 p-4"><p className="text-xs text-muted-foreground">Comparable asking prices{stale?' · Refresh recommended':''}</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(range.lowCents)}–{formatMoney(range.highCents)}</p><p className="mt-1 text-xs text-muted-foreground">{range.count} active listings · Middle price {formatMoney(range.medianCents)}</p></div>}
            <div className="grid gap-3 sm:grid-cols-2">{platforms.map(p => <div key={p.id} className="flex items-start gap-3 rounded-xl border p-4"><PlatformLogo platform={p.id}/><div className="min-w-0"><h3 className="text-sm font-semibold">{p.name}</h3><p className="mt-1 text-xs text-muted-foreground">{p.reason}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium"><a href={p.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Compare<ArrowUpRight className="size-3"/></a><a href={p.sellUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Sell here<ArrowUpRight className="size-3"/></a></div></div></div>)}</div>
            <Button variant="outline" size="sm" onClick={copy}>{copied?<Check/>:<Copy/>}{copied?'Draft copied':'Copy listing draft'}</Button>
            {research.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load saved research. Try comparing prices again.</p>}
            {research.refresh.isError && <p role="alert" className="text-sm text-destructive">{research.refresh.error.message}</p>}
            {report && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{report.listings.length ? `Comparable listings (${report.listings.length})` : 'Research details'}</summary><div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground">{report.message}</p>
                <p className="text-xs text-muted-foreground">{new Date(report.researchedAt).toLocaleString()} · Asking prices, not completed sales.</p>
                {report.providerStatus==='needs_connection' && <Link to="/settings" className="text-xs underline">View marketplace setup</Link>}
                {report.listings.length>0 && <ul className="divide-y">{report.listings.map(l => <li key={l.id} className="py-3"><a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 text-sm hover:underline"><span>{l.title}</span><ArrowUpRight className="size-4 shrink-0"/></a><p className="mt-1 text-sm font-medium tabular-nums">{formatMoney(l.priceCents)} <span className="text-xs font-normal text-muted-foreground">{l.shippingCents!=null?`+ ${formatMoney(l.shippingCents)} shipping`:'Shipping unknown'} · {l.condition??'Condition unknown'}</span></p></li>)}</ul>}
                {range && <Button size="sm" variant="outline" onClick={record} disabled={addValue.isPending||!!stale}>Record this estimate</Button>}
            </div></details>}
            {range && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Estimate selling proceeds</summary><div className="mt-3 space-y-2"><label htmlFor={`selling-costs-${item.asset.id}`} className="text-xs text-muted-foreground">Your fees, shipping & other costs (USD)</label><Input id={`selling-costs-${item.asset.id}`} value={costs} onChange={e => setCosts(e.target.value)} inputMode="decimal" placeholder="Enter total costs, including $0" aria-invalid={parsedCosts===undefined||undefined}/>{parsedCosts===undefined && <p className="text-xs text-destructive">Enter a valid dollar amount.</p>}<p className="text-sm">{net!=null?`Estimated proceeds: ${formatMoney(net)}`:'Add costs to estimate proceeds at the middle asking price.'}</p></div></details>}
        </CardContent>
    </Card>;
}
