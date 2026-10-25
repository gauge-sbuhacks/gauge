// optional lookups for one asset. vehicles: vin decode + recalls (nhtsa, free) and a vinaudit
// market value (needs a key). real estate: a rentcast value estimate (needs a key). trading cards: tcgdex / scryfall prices (free). metals:
// melt value from the live spot price (free). results are shown for review; nothing is saved
// until you apply it or record it as a value.

import { useState, type FormEvent, type ReactNode } from 'react';
import { Coins, ExternalLink, Gauge, House, Layers, LoaderCircle, ScanSearch, Siren } from 'lucide-react';
import { toast } from 'sonner';
import { getCategory, type Details } from '@shared/categories.ts';
import { centsToInput } from '@shared/money.ts';
import {
    CARD_GAME_LABELS,
    CARD_GAMES,
    SPOT_METALS,
    type CardGame,
    type CardMatch,
    type CardPrice,
    type CardPriceResult,
    type LookupSuggestion,
    type MetalValueResult,
    type PropertyValueResult,
    type RecallLookupResult,
    type SpotMetal,
    type VehicleValueResult,
    type VinLookupResult
} from '@shared/schemas.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx';
import {
    useCardPriceLookup,
    useHealth,
    useMetalValueLookup,
    usePropertyValueLookup,
    useRecallLookup,
    useUpdateAsset,
    useVehicleValueLookup,
    useVinLookup
} from '@/hooks/usePortfolio.ts';
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

function VehicleLookups({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
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

            <VehicleValueSection item={item} onRecord={onRecord} />

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

const signedMoney = (cents: number) => `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents))}`;

function VehicleValueSection({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    const { asset } = item;
    const vin = typeof asset.details.vin === 'string' ? asset.details.vin : '';
    const mileage = typeof asset.details.mileage === 'number' ? asset.details.mileage : null;
    const titleStatus = typeof asset.details.titleStatus === 'string' ? asset.details.titleStatus : null;
    const health = useHealth();
    const lookup = useVehicleValueLookup();
    const [result, setResult] = useState<VehicleValueResult | null>(null);

    const ready = health.data?.providers.find((p) => p.id === 'vinaudit')?.status === 'ready';

    const run = () =>
        lookup.mutate(
            { vin, mileage, condition: asset.condition, titleStatus },
            { onSuccess: setResult, onError: (err) => toast.error('Market value lookup failed', { description: err.message }) }
        );

    const record = (r: VehicleValueResult, kind: 'retail' | 'tradeIn', valueType: 'fair_market' | 'liquidation') => {
        const v = r[kind]!;
        const what = kind === 'retail' ? 'Retail' : 'Trade-in';
        onRecord({
            valueType,
            mode: 'amount',
            amount: centsToInput(v.valueCents),
            observedAt: todayIso(),
            source: 'provider',
            sourceName: `VinAudit ${what.toLowerCase()}`,
            method: 'Market value from recent listings, adjusted for mileage, condition, and title',
            conditionAssumption: asset.condition ?? '',
            notes: [
                `${what} estimate`,
                v.lowCents != null && v.highCents != null && `range ${formatMoney(v.lowCents)} to ${formatMoney(v.highCents)}`,
                r.mileage != null && `at ${r.mileage.toLocaleString('en-US')} miles`,
                v.sampleCount != null && `from ${v.sampleCount} listings`
            ]
                .filter(Boolean)
                .join(', ')
        });
    };

    return (
        <Section icon={<Gauge className="size-4" />} title="Market value" description="Retail and trade-in values from VinAudit, adjusted for mileage, condition, and title.">
            {!ready ? (
                <p className="text-sm text-muted-foreground">
                    Needs a VinAudit API key (<code className="text-xs">VINAUDIT_API_KEY</code>). The trial allows 100 queries, and each lookup uses 2. See Setup.
                </p>
            ) : vin.length !== 17 ? (
                <p className="text-sm text-muted-foreground">Needs the full 17-character VIN (Edit).</p>
            ) : (
                <div className="space-y-3">
                    {mileage == null && <p className="text-xs text-muted-foreground">No mileage entered, so the estimate will assume average mileage.</p>}
                    <Button size="sm" variant="outline" onClick={run} disabled={lookup.isPending}>
                        {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Get market value
                    </Button>
                    {result && (
                        <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="font-medium">{result.vehicle ?? 'This vehicle'}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{result.providerLabel}</span>
                            </div>
                            {[
                                { kind: 'retail' as const, label: 'Retail', value: result.retail, actions: [['Fair market', 'fair_market']] as const },
                                { kind: 'tradeIn' as const, label: 'Trade-in', value: result.tradeIn, actions: [['Liquidation', 'liquidation']] as const }
                            ].map(({ kind, label, value, actions }) => (
                                <div key={kind} className="space-y-1.5 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-muted-foreground">{label}</span>
                                        <span className="text-lg font-semibold tabular-nums">{value ? formatMoney(value.valueCents) : 'No estimate'}</span>
                                    </div>
                                    {value && (
                                        <>
                                            {value.lowCents != null && value.highCents != null && (
                                                <p className="text-xs text-muted-foreground">
                                                    Most between {formatMoney(value.lowCents)} and {formatMoney(value.highCents)}
                                                    {value.sampleCount != null && `, from ${value.sampleCount} listings`}
                                                    {value.certainty != null && `, ${value.certainty}% certainty`}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-xs text-muted-foreground">Record as</span>
                                                {actions.map(([text, valueType]) => (
                                                    <Button key={valueType} size="xs" variant="outline" onClick={() => record(result, kind, valueType)}>
                                                        {text}
                                                    </Button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                            {result.adjustments.length > 0 && (
                                <ul className="space-y-0.5 border-t pt-2 text-xs">
                                    {result.adjustments.map((a) => (
                                        <li key={a.label} className="flex justify-between gap-2">
                                            <span className="text-muted-foreground">{a.label} adjustment</span>
                                            <span className="tabular-nums">{signedMoney(a.cents)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="space-y-1 border-t pt-2">
                                {result.mileage != null && result.period && (
                                    <p className="text-xs text-muted-foreground">
                                        Priced at {result.mileage.toLocaleString('en-US')} miles, from listings {formatDate(result.period.from)} to {formatDate(result.period.to)}.
                                    </p>
                                )}
                                {result.notes.map((n) => (
                                    <p key={n} className="text-xs text-muted-foreground">
                                        {n}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Section>
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

// ---------- trading cards ----------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function guessGame(text: string): CardGame {
    return /magic|mtg|gathering/i.test(text) && !/pok[eé]mon/i.test(text) ? 'magic' : 'pokemon';
}

// "Charizard Holo 4/102 (PSA 8)" -> "Charizard". the user can fix it before searching
function guessCardName(name: string): string {
    const cleaned = name
        .replace(/\(.*?\)/g, ' ')
        .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
        .replace(/\b(1st edition|first edition|shadowless|unlimited|reverse holo|holofoil|holo|non-?foil|foil|graded|(psa|bgs|cgc|sgc)\s*[\d.]*)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || name;
}

function graderLabel(value: string): string {
    const field = getCategory('collectible').fields.find((f) => f.key === 'grader');
    return field?.options?.find((o) => o.value === value)?.label ?? value.toUpperCase();
}

const eur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceText = (p: CardPrice) => (p.marketCents == null ? 'No price' : p.currency === 'EUR' ? eur.format(p.marketCents / 100) : formatMoney(p.marketCents, { exact: true }));

function CardLookups({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    const { asset } = item;
    const d = asset.details;
    const lookup = useCardPriceLookup();
    const [game, setGame] = useState<CardGame>(() => asset.details.game === 'magic' || asset.details.game === 'pokemon' ? asset.details.game : guessGame([asset.brand, asset.model, asset.name].join(' ')));
    const [name, setName] = useState(() => guessCardName(asset.name));
    const [setName_, setSetName] = useState(() => str(d.setName) || asset.model || '');
    const [number, setNumber] = useState(() => str(d.cardNumber));
    const [result, setResult] = useState<CardPriceResult | null>(null);

    const graded = str(d.grader) && d.grader !== 'ungraded' ? [graderLabel(str(d.grader)), str(d.grade)].filter(Boolean).join(' ') : null;

    const run = (e: FormEvent) => {
        e.preventDefault();
        lookup.mutate(
            { game, name, setName: setName_.trim() || null, number: number.trim() || null },
            { onSuccess: setResult, onError: (err) => toast.error('Card price lookup failed', { description: err.message }) }
        );
    };

    const record = (r: CardPriceResult, m: CardMatch, p: CardPrice) =>
        onRecord({
            valueType: 'fair_market',
            mode: 'amount',
            amount: centsToInput(p.marketCents),
            observedAt: todayIso(),
            source: 'provider',
            sourceName: `${p.source} via ${r.providerLabel}`,
            method: 'Market price for an ungraded copy',
            notes: `${m.name}, ${m.setName} #${m.number}, ${p.label.toLowerCase()}.${graded ? ` This copy is graded ${graded}, so the raw price is only a reference.` : ''}`
        });

    return (
        <Section icon={<Layers className="size-4" />} title="Card prices" description="TCGplayer market prices. Pokémon from TCGdex, Magic from Scryfall. Free, no key.">
            <form onSubmit={run} className="space-y-3">
                <ToggleGroup type="single" variant="outline" size="sm" value={game} onValueChange={(v) => v && setGame(v as CardGame)} aria-label="Game">
                    {CARD_GAMES.map((g) => (
                        <ToggleGroupItem key={g} value={g}>
                            {CARD_GAME_LABELS[g]}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                <div className="space-y-1.5">
                    <Label htmlFor="card-name">Card name</Label>
                    <Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
                </div>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="card-set">Set</Label>
                        <Input id="card-set" value={setName_} onChange={(e) => setSetName(e.target.value)} maxLength={120} autoComplete="off" placeholder="Base Set" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="card-number">Number</Label>
                        <Input id="card-number" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} autoComplete="off" placeholder="4/102" className="font-mono" />
                    </div>
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={lookup.isPending || name.trim() === ''}>
                    {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                    Find prices
                </Button>
            </form>

            {result && (
                <div className="mt-4 space-y-2">
                    {graded && (
                        <p className="text-xs text-muted-foreground">
                            This card is graded {graded}. Graded copies trade at very different prices than raw ones, so use these as a reference.
                        </p>
                    )}
                    <ul className="space-y-2">
                        {result.matches.map((m) => (
                            <li key={m.id} className="flex gap-3 rounded-lg border p-3">
                                {m.imageUrl && <img src={m.imageUrl} alt="" loading="lazy" className="h-20 w-auto shrink-0 self-start rounded-[3px] border bg-muted" />}
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-sm font-medium">{m.name}</span>
                                        {m.exact && <Badge variant="secondary">Matches set and number</Badge>}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {m.setName} · #{m.number}
                                        {m.rarity && ` · ${m.rarity}`}
                                    </p>
                                    {m.prices.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No recent sales price for this printing.</p>
                                    ) : (
                                        <ul className="space-y-1">
                                            {m.prices.map((p) => (
                                                <li key={`${p.source}-${p.label}`} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
                                                    <span className="text-muted-foreground">
                                                        {p.label} <span className="text-xs">({p.source})</span>
                                                    </span>
                                                    <span className="flex shrink-0 items-center gap-2">
                                                        <span className="font-medium tabular-nums">{priceText(p)}</span>
                                                        {p.currency === 'USD' && p.marketCents != null && (
                                                            <Button size="xs" variant="outline" onClick={() => record(result, m, p)}>
                                                                Record
                                                            </Button>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {m.url && (
                                        <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
                                            {result.provider === 'scryfall' ? 'View on Scryfall' : 'View on TCGplayer'} <ExternalLink className="size-3" />
                                        </a>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {result.notes.map((n) => (
                        <p key={n} className="text-xs text-muted-foreground">
                            {n}
                        </p>
                    ))}
                </div>
            )}
        </Section>
    );
}

// ---------- gold, silver, platinum, palladium ----------

const formatPurity = (p: number) => `${Number((p * 100).toFixed(2))}%`;

function MetalLookups({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    const d = item.asset.details;
    const metal = str(d.metal);
    const purity = str(d.purity);
    const weightGrams = typeof d.weightGrams === 'number' ? d.weightGrams : null;
    const quantity = typeof d.quantity === 'number' ? d.quantity : null;
    const lookup = useMetalValueLookup();
    const [result, setResult] = useState<MetalValueResult | null>(null);

    const isSpotMetal = (SPOT_METALS as readonly string[]).includes(metal);
    const missing = [!weightGrams && 'total metal weight', !purity && 'purity'].filter(Boolean) as string[];
    // melt value is close to what bullion sells for; for jewelry it's the floor, so record it as liquidation
    const asLiquidation = d.kind === 'jewelry' || d.kind === 'gemstone';

    const run = () =>
        lookup.mutate(
            { metal: metal as SpotMetal, weightGrams: weightGrams!, purity },
            { onSuccess: setResult, onError: (err) => toast.error('Melt value lookup failed', { description: err.message }) }
        );

    return (
        <Section icon={<Coins className="size-4" />} title="Melt value" description="Live spot price x weight x purity, from gold-api.com. Free, no key.">
            {!isSpotMetal ? (
                <p className="text-sm text-muted-foreground">Set the metal to gold, silver, platinum, or palladium (Edit) to get a melt value.</p>
            ) : missing.length > 0 ? (
                <p className="text-sm text-muted-foreground">Add the {missing.join(' and ')} (Edit) to get a melt value.</p>
            ) : (
                <div className="space-y-3">
                    <Button size="sm" variant="outline" onClick={run} disabled={lookup.isPending}>
                        {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Get the {metal} melt value
                    </Button>
                    {result && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="flex items-baseline justify-between">
                                <span className="text-lg font-semibold">{formatMoney(result.meltValueCents)}</span>
                                <span className="text-xs text-muted-foreground">{result.providerLabel}</span>
                            </div>
                            <p className="text-muted-foreground">
                                {result.fineOunces.toFixed(3)} troy oz of pure {result.metal}: {result.weightGrams} g at {formatPurity(result.purity)}
                                {quantity != null && quantity > 1 && `, all ${quantity} pieces`}
                            </p>
                            <p className="text-muted-foreground">
                                Spot {formatMoney(result.spotCentsPerOunce, { exact: true })} per troy oz, as of{' '}
                                {new Date(result.spotUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </p>
                            {result.notes.map((n) => (
                                <p key={n} className="mt-1 text-xs text-muted-foreground">
                                    {n}
                                </p>
                            ))}
                            <Button
                                size="sm"
                                className="mt-3"
                                onClick={() =>
                                    onRecord({
                                        valueType: asLiquidation ? 'liquidation' : 'fair_market',
                                        mode: 'amount',
                                        amount: centsToInput(result.meltValueCents),
                                        observedAt: todayIso(),
                                        source: 'provider',
                                        sourceName: 'gold-api.com spot price',
                                        method: 'Spot price x weight x purity',
                                        notes: `${result.fineOunces.toFixed(3)} troy oz of pure ${result.metal} at ${formatMoney(result.spotCentsPerOunce, { exact: true })}/oz spot`
                                    })
                                }
                            >
                                Record as {asLiquidation ? 'liquidation' : 'fair market'} value
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Section>
    );
}

// ---------- everything else ----------


export function LookupPanel({ item, onRecord }: { item: PortfolioItem; onRecord: (initial: Partial<ValuationFormValues>) => void }) {
    const { category, details } = item.asset;
    if (category === 'vehicle') return <VehicleLookups item={item} onRecord={onRecord} />;
    if (category === 'property') return <PropertyLookups item={item} onRecord={onRecord} />;
    if (category === 'jewelry') return <MetalLookups item={item} onRecord={onRecord} />;
    if (category === 'collectible' && details.kind === 'trading_card') return <CardLookups item={item} onRecord={onRecord} />;
    return (
        <p className="text-sm text-muted-foreground">
            Use the market research panel above to compare current listings.
        </p>
    );
}
