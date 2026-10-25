import { itemGain, valueOf, type PortfolioItem } from './portfolio.ts';
export function liquiditySummary(items: PortfolioItem[]) {
    const pairs=items.filter(i => valueOf(i,'fair_market') != null && valueOf(i,'liquidation') != null);
    const marketCents=pairs.reduce((s,i) => s+valueOf(i,'fair_market')!,0);
    const quickCents=pairs.reduce((s,i) => s+valueOf(i,'liquidation')!,0);
    return { pairs, marketCents, quickCents, gapCents:marketCents-quickCents,
        needsResearch:items.filter(i => !i.latest.fair_market || Date.now()-Date.parse(i.latest.fair_market.observedAt)>180*86400000),
        gains:items.map(item => ({ item, gain:itemGain(item) })).filter((v): v is { item:PortfolioItem; gain:NonNullable<ReturnType<typeof itemGain>> } => v.gain != null).sort((a,b) => Math.abs(b.gain.gainCents)-Math.abs(a.gain.gainCents)).slice(0,6) };
}
