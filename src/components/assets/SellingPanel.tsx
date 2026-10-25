import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Check, Copy, LoaderCircle, MapPin, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listingDraft, sellingPlatforms } from '@shared/marketplace.ts';
import { parseMoneyInput } from '@shared/money.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Badge } from '@/components/ui/badge.tsx';
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

    return <Card id="sell" className="scroll-mt-6 overflow-hidden border-primary/20">
        <CardHeader className="border-b bg-primary/[.035] pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">Realize your value</p>
                    <CardTitle className="mt-2 text-2xl tracking-tight">Find your market.</CardTitle>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">Compare similar items, choose an asking price, and take the next step toward a sale.</p>
                </div>
                <Button onClick={() => research.refresh.mutate()} disabled={research.refresh.isPending || research.isPending}>
                    {research.refresh.isPending ? <LoaderCircle className="animate-spin"/> : report ? <RefreshCw/> : <Search/>}
                    {research.refresh.isPending ? 'Researching prices' : report ? 'Refresh research' : 'Research prices'}
                </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><MapPin className="size-3.5"/>
                {location ? `${location.city}, ${location.region} · ${location.postalCode} · ${location.country}` : 'Set your selling location for relevant searches'}
                <Link className="font-medium text-foreground underline-offset-4 hover:underline" to="/onboarding?edit">{location ? 'Edit location' : 'Add location'}</Link>
            </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
            <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Suggested listing range</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{range ? `${formatMoney(range.lowCents)}–${formatMoney(range.highCents)}` : 'Research needed'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{range ? `Middle asking price ${formatMoney(range.medianCents)} · ${range.count} comparables` : 'Needs at least 3 relevant live listings.'}</p>
                </div>
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Recorded quick-sale value</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{valueOf(item,'liquidation') != null ? formatMoney(valueOf(item,'liquidation')!) : 'Not recorded'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Your recorded estimate. Sale timing and proceeds are unverified.</p>
                </div>
                <div className="rounded-xl border bg-muted/25 p-4"><p className="text-xs text-muted-foreground">Estimated net at middle asking price</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{net != null ? formatMoney(net) : range ? 'Add selling costs' : 'Research needed'}</p>
                    <label className="mt-3 block text-xs text-muted-foreground" htmlFor={`selling-costs-${item.asset.id}`}>Fees + shipping + other costs (USD)</label>
                    <Input id={`selling-costs-${item.asset.id}`} value={costs} onChange={e => setCosts(e.target.value)} inputMode="decimal" placeholder="Enter costs, including $0" className="mt-1 h-8 bg-card" aria-invalid={parsedCosts === undefined || undefined}/>
                    {parsedCosts === undefined && <p className="mt-1 text-xs text-destructive">Enter a valid dollar amount.</p>}
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copy}>{copied ? <Check/> : <Copy/>}{copied ? 'Draft copied' : 'Copy listing draft'}</Button>
                {range && <Button variant="outline" onClick={record} disabled={addValue.isPending || !!stale}>{addValue.isPending && <LoaderCircle className="animate-spin"/>}Record this estimate</Button>}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                {platforms.map(p => <div key={p.id} className="flex items-start gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/25">
                    <PlatformLogo platform={p.id}/><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{p.name}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.reason}</p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium"><a href={p.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Compare listings <ArrowUpRight className="size-3"/></a><a href={p.sellUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Sell on {p.name} <ArrowUpRight className="size-3"/></a></div>
                    </div>
                </div>)}
            </div>
            {research.isError && <p role="alert" className="text-sm text-destructive">Couldn’t load previous research. Try researching again.</p>}
            {research.refresh.isError && <p role="alert" className="text-sm text-destructive">{research.refresh.error.message}</p>}
            {report && <div className="space-y-4 border-t pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Market evidence</h3><Badge variant="outline">{report.providerStatus === 'ready' ? stale ? 'Refresh recommended' : 'Active asking prices' : report.providerStatus === 'needs_connection' ? 'Connection needed' : report.providerStatus === 'unsupported' ? 'Platform research' : 'Research unavailable'}</Badge></div>
                <p className="text-xs leading-relaxed text-muted-foreground">{report.message}</p>
                <p className="text-xs text-muted-foreground">Researched {new Date(report.researchedAt).toLocaleString()} · Search: {report.query}. Shipping is shown separately where available.</p>
                {report.providerStatus === 'needs_connection' && <Link className="inline-block text-xs font-medium underline" to="/settings">View marketplace connections</Link>}
                {report.listings.length > 0 && <ul className="grid gap-3 md:grid-cols-2">{report.listings.map(l => <li key={l.id} className="rounded-xl border p-4">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 text-sm font-medium hover:underline"><span>{l.title}</span><ArrowUpRight className="size-4 shrink-0"/></a>
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2"><span className="text-lg font-semibold tabular-nums">{formatMoney(l.priceCents)}</span><span className="text-xs text-muted-foreground">{l.shippingCents != null ? `+ ${formatMoney(l.shippingCents)} shipping` : 'Shipping not provided'}</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">eBay · {l.condition ?? 'Condition not provided'}{l.location ? ` · ${l.location}` : ''}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{l.matchReasons.join(' · ')}</p>
                </li>)}</ul>}
            </div>}
            <p className="text-xs leading-relaxed text-muted-foreground">Check condition, variant, seller fees, and shipping before setting your price. Listing prices do not confirm demand or how quickly an item will sell. Platform links open a new tab; you review and publish there.</p>
        </CardContent>
    </Card>;
}
