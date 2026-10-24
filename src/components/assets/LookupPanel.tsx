// optional lookups for one asset. vehicles: vin decode + recalls (nhtsa, free). real estate: a
// rentcast value estimate (needs a key). results are shown for review; nothing is saved until you
// apply it or record it as a value.

import { useState, type ReactNode } from 'react';
import { ExternalLink, House, LoaderCircle, ScanSearch, Siren } from 'lucide-react';
import { toast } from 'sonner';
import type { Details } from '@shared/categories.ts';
import { centsToInput } from '@shared/money.ts';
import type { LookupSuggestion, PropertyValueResult, RecallLookupResult, VinLookupResult } from '@shared/schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import { useHealth, usePropertyValueLookup, useRecallLookup, useUpdateAsset, useVinLookup } from '@/hooks/usePortfolio.ts';
import { formatDate, formatMoney, todayIso } from '@/lib/format.ts';
import type { PortfolioItem } from '@/lib/portfolio.ts';
import { SuggestionReview } from './SuggestionReview.tsx';
import type { ValuationFormValues } from './ValuationDialog.tsx';

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-muted-foreground">{icon}</span>
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
            </div>
            <div className="pl-7">{children}</div>
        </div>
    );
}

// ---------- vehicles ----------

function VehicleLookups({ item }: { item: PortfolioItem }) {
    const { asset } = item;
    const vin = typeof asset.details.vin === 'string' ? asset.details.vin : '';
    const year = typeof asset.details.year === 'number' ? asset.details.year : null;
    const vinLookup = useVinLookup();
    const recallLookup = useRecallLookup();
    const update = useUpdateAsset(asset.id);
    const [vinResult, setVinResult] = useState<VinLookupResult | null>(null);
    const [recalls, setRecalls] = useState<RecallLookupResult | null>(null);

    const current = (field: string): string => {
        if (field === 'brand') return asset.brand ?? '';
        if (field === 'model') return asset.model ?? '';
        const v = asset.details[field.replace(/^details\./, '')];
        return v == null ? '' : String(v);
    };

    const apply = (chosen: LookupSuggestion[]) => {
        const details: Details = { ...asset.details };
        const patch: { brand?: string; model?: string; details?: Details } = {};
        for (const s of chosen) {
            if (s.field === 'brand') patch.brand = String(s.value);
            else if (s.field === 'model') patch.model = String(s.value);
            else if (s.field.startsWith('details.')) details[s.field.slice(8)] = s.value;
        }
        patch.details = details;
        update.mutate(patch, {
            onSuccess: () => {
                toast.success(`Updated ${chosen.length} field${chosen.length === 1 ? '' : 's'} from NHTSA`);
                setVinResult(null);
            },
            onError: (err) => toast.error("Couldn't apply the changes", { description: err.message })
        });
    };

    const canRecall = Boolean(asset.brand && asset.model && year);

    return (
        <div className="space-y-6">
            <Section icon={<ScanSearch className="size-4" />} title="Decode VIN" description="Specs from NHTSA vPIC. Free, no key needed. No prices.">
                {vin ? (
                    <div className="space-y-3">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={vinLookup.isPending}
                            onClick={() =>
                                vinLookup.mutate(vin, {
                                    onSuccess: setVinResult,
                                    onError: (err) => toast.error('VIN lookup failed', { description: err.message })
                                })
                            }
                        >
                            {vinLookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                            Decode <span className="font-mono">{vin}</span>
                        </Button>
                        {vinResult && (
                            <SuggestionReview
                                key={vinResult.fetchedAt}
                                providerLabel={vinResult.providerLabel}
                                fetchedAt={vinResult.fetchedAt}
                                suggestions={vinResult.suggestions.filter((s) => s.field !== 'details.vin')}
                                specs={vinResult.specs}
                                warnings={vinResult.warnings}
                                currentValue={current}
                                onApply={apply}
                                onDismiss={() => setVinResult(null)}
                                applying={update.isPending}
                            />
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Add the VIN (Edit) to decode it.</p>
                )}
            </Section>

            <Section icon={<Siren className="size-4" />} title="Safety recalls" description="NHTSA recalls for this make, model, and year. Free, no key needed.">
                {canRecall ? (
                    <div className="space-y-3">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={recallLookup.isPending}
                            onClick={() =>
                                recallLookup.mutate(
                                    { make: asset.brand!, model: asset.model!, year: year! },
                                    { onSuccess: setRecalls, onError: (err) => toast.error('Recall lookup failed', { description: err.message }) }
                                )
                            }
                        >
                            {recallLookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                            Check recalls for {year} {asset.brand} {asset.model}
                        </Button>
                        {recalls && <RecallList result={recalls} />}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Needs the make, model, and year.</p>
                )}
            </Section>
        </div>
    );
}

function RecallList({ result }: { result: RecallLookupResult }) {
    if (result.recalls.length === 0) {
        return <p className="text-sm text-gain">No recalls on file for this make, model, and year.</p>;
    }
    return (
        <div className="space-y-2">
            <p className="text-sm">
                <span className="font-medium">
                    {result.recalls.length} recall{result.recalls.length === 1 ? '' : 's'}
                </span>{' '}
                <span className="text-muted-foreground">for all {result.query.year} {result.query.model} models. Check your own VIN at nhtsa.gov to see if yours was already fixed.</span>
            </p>
            <ul className="space-y-2">
                {result.recalls.map((r) => (
                    <li key={r.campaignNumber} className="rounded-lg border p-3 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium">{r.component.split(':')[0] || 'Recall'}</span>
                            <span className="text-xs text-muted-foreground">
                                {r.campaignNumber}
                                {r.reportedAt && ` · ${formatDate(r.reportedAt)}`}
                            </span>
                        </div>
                        {(r.parkIt || r.parkOutside) && (
                            <p className="mt-1 text-xs font-semibold text-loss">{r.parkIt ? 'NHTSA says do not drive until fixed.' : 'NHTSA says park outside until fixed.'}</p>
                        )}
                        <p className="mt-1 line-clamp-3 text-muted-foreground">{r.summary}</p>
                        <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline">
                            Details on nhtsa.gov <ExternalLink className="size-3" />
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ---------- real estate ----------

function PropertyLookups({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    const d = item.asset.details;
    const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
    const num = (k: string) => (typeof d[k] === 'number' ? (d[k] as number) : null);
    const health = useHealth();
    const lookup = usePropertyValueLookup();
    const [result, setResult] = useState<PropertyValueResult | null>(null);

    const rentcast = health.data?.providers.find((p) => p.id === 'rentcast');
    const ready = rentcast?.status === 'ready';
    const missing = [!str('addressLine1') && 'street address', !str('city') && 'city', !str('state') && 'state'].filter(Boolean) as string[];

    const run = () =>
        lookup.mutate(
            {
                addressLine1: str('addressLine1'),
                city: str('city'),
                state: str('state'),
                postalCode: str('postalCode') || null,
                propertyType: str('propertyType') || null,
                bedrooms: num('bedrooms'),
                bathrooms: num('bathrooms'),
                squareFeet: num('squareFeet')
            },
            { onSuccess: setResult, onError: (err) => toast.error('Value lookup failed', { description: err.message }) }
        );

    return (
        <Section icon={<House className="size-4" />} title="Home value estimate" description="RentCast automated valuation with nearby comparables.">
            {!ready ? (
                <p className="text-sm text-muted-foreground">
                    Needs a RentCast API key (<code className="text-xs">RENTCAST_API_KEY</code>). The free plan allows 50 lookups a month. See Setup.
                </p>
            ) : missing.length > 0 ? (
                <p className="text-sm text-muted-foreground">Add the {missing.join(', ')} (Edit) to run a lookup.</p>
            ) : (
                <div className="space-y-3">
                    <Button size="sm" variant="outline" onClick={run} disabled={lookup.isPending}>
                        {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Get an estimate
                    </Button>
                    {result && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="flex items-baseline justify-between">
                                <span className="text-lg font-semibold">{result.valueCents != null ? formatMoney(result.valueCents) : 'No estimate'}</span>
                                <span className="text-xs text-muted-foreground">{result.providerLabel}</span>
                            </div>
                            {result.lowCents != null && result.highCents != null && (
                                <p className="text-muted-foreground">
                                    Range {formatMoney(result.lowCents)} to {formatMoney(result.highCents)}
                                </p>
                            )}
                            {result.comparables.length > 0 && (
                                <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                                    {result.comparables.map((c, i) => (
                                        <li key={i} className="flex justify-between gap-2">
                                            <span className="truncate">{c.address}</span>
                                            <span className="shrink-0 tabular-nums">{c.priceCents != null ? formatMoney(c.priceCents) : ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {result.notes.map((n) => (
                                <p key={n} className="mt-1 text-xs text-muted-foreground">
                                    {n}
                                </p>
                            ))}
                            {result.valueCents != null && (
                                <Button
                                    size="sm"
                                    className="mt-3"
                                    onClick={() =>
                                        onRecord({
                                            valueType: 'fair_market',
                                            mode: result.lowCents != null && result.highCents != null ? 'range' : 'amount',
                                            amount: centsToInput(result.valueCents),
                                            low: centsToInput(result.lowCents),
                                            high: centsToInput(result.highCents),
                                            observedAt: todayIso(),
                                            source: 'provider',
                                            sourceName: 'RentCast AVM',
                                            notes: `Automated estimate of ${formatMoney(result.valueCents!)}, based on ${result.comparables.length} nearby listings`
                                        })
                                    }
                                >
                                    Record as fair market value
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Section>
    );
}

// ---------- everything else ----------

const PLANNED: Partial<Record<string, string>> = {
    watch: 'Watch market values (WatchCharts, paid) are on the list.',
    jewelry: 'Gold and silver spot prices (value = spot x weight x purity) are next on the list.',
    collectible: 'Card prices (Pokémon TCG API, Scryfall) and record prices (Discogs) are on the list.',
    electronics: 'Retail replacement prices (Best Buy) and barcode lookup are on the list.',
    household: 'Current listing prices (eBay Browse) are on the list.',
    equipment: 'Current listing prices (eBay Browse) are on the list.',
    other: 'Current listing prices (eBay Browse) are on the list.'
};

export function LookupPanel({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    if (item.asset.category === 'vehicle') return <VehicleLookups item={item} />;
    if (item.asset.category === 'property') return <PropertyLookups item={item} onRecord={onRecord} />;
    return (
        <p className="text-sm text-muted-foreground">
            No automatic lookups for this category yet. {PLANNED[item.asset.category]} For now, record values by hand.
        </p>
    );
}
