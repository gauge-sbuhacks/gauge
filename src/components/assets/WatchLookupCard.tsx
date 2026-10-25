// look up a watch by brand + reference and apply prices or metadata to a form.

import { LoaderCircle, ScanSearch } from 'lucide-react';
import type { WatchSearchResult, WatchValueResult } from '@shared/schemas.ts';
import { centsToInput } from '@shared/money.ts';
import { Button } from '@/components/ui/button.tsx';
import { formatMoney } from '@/lib/format.ts';
import { cn } from '@/lib/utils.ts';

export function WatchLookupCard({
    brand,
    reference,
    searching,
    pricing,
    searchResult,
    priceResult,
    onSearch,
    onPrice,
    onApplyMatch,
    onApplyPrices,
    onDismiss
}: {
    brand: string;
    reference: string;
    searching: boolean;
    pricing: boolean;
    searchResult: WatchSearchResult | null;
    priceResult: WatchValueResult | null;
    onSearch: () => void;
    onPrice: () => void;
    onApplyMatch: (index: number) => void;
    onApplyPrices: () => void;
    onDismiss: () => void;
}) {
    const canSearch = reference.trim().length >= 3;
    const canPrice = brand.trim().length > 0 && reference.trim().length > 0;

    return (
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <div>
                <p className="text-sm font-medium">The Watch API</p>
                <p className="text-xs text-muted-foreground">Search by reference, then pull asking-price averages for fair market.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!canSearch || searching} onClick={onSearch}>
                    {searching ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
                    Find reference
                </Button>
                <Button type="button" size="sm" disabled={!canPrice || pricing} onClick={onPrice}>
                    {pricing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
                    Get prices
                </Button>
                {(searchResult || priceResult) && (
                    <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
                        Dismiss
                    </Button>
                )}
            </div>
            {searchResult && searchResult.matches.length > 0 && (
                <ul className="space-y-2 text-sm">
                    {searchResult.matches.map((m, i) => (
                        <li key={`${m.brand}-${m.referenceNumber}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                            <div>
                                <p className="font-medium">
                                    {m.brand} {m.referenceNumber}
                                </p>
                                <p className="text-xs text-muted-foreground">{[m.model, m.caseMaterial, m.yearsProduced].filter(Boolean).join(' · ') || 'No extra specs'}</p>
                            </div>
                            <Button type="button" variant="secondary" size="sm" onClick={() => onApplyMatch(i)}>
                                Use this watch
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            {searchResult && searchResult.matches.length === 0 && (
                <p className="text-sm text-muted-foreground">No matches for that reference. Check spelling or try the number on the case back.</p>
            )}
            {priceResult && (
                <div className={cn('space-y-2 text-sm', priceResult.fairMarketCents == null && 'text-muted-foreground')}>
                    {priceResult.notes.map((note) => (
                        <p key={note}>{note}</p>
                    ))}
                    {priceResult.fairMarketCents != null && (
                        <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={onApplyPrices}>
                                Apply {formatMoney(priceResult.fairMarketCents)} fair market
                                {priceResult.quickSaleCents != null ? ` · ${formatMoney(priceResult.quickSaleCents)} quick sale` : ''}
                            </Button>
                            <span className="self-center text-xs text-muted-foreground tabular-nums">
                                {formatMoney(priceResult.fairMarketCents)} FMV
                                {priceResult.quickSaleCents != null ? ` (${centsToInput(priceResult.quickSaleCents)} quick)` : ''}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
