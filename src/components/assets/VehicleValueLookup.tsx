import { useState } from 'react';
import { Gauge, LoaderCircle } from 'lucide-react';
import { vehicleValueQuerySchema, type VehicleValueQuery, type VehicleValueResult } from '@shared/schemas.ts';
import { centsToInput } from '@shared/money.ts';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useHealth, useVehicleValueLookup } from '@/hooks/usePortfolio.ts';
import { formatDate, formatMoney, todayIso } from '@/lib/format.ts';
import { Field, OptionalSelect } from './FormBits.tsx';
import type { ValuationFormValues } from './ValuationDialog.tsx';

const signedMoney = (cents: number) => `${cents > 0 ? '+' : '−'}${formatMoney(Math.abs(cents))}`;

type Props = { query: VehicleValueQuery; onRecord: (initial: Partial<ValuationFormValues>) => void; actionLabel?: string; allowMonthlyUpdates?: boolean };

export function VehicleValueLookup(props: Props) {
    return <VehicleValueLookupBody key={JSON.stringify(props.query)} {...props} />;
}

function VehicleValueLookupBody({ query, onRecord, actionLabel = 'Record as', allowMonthlyUpdates = true }: Props) {
    const { vin, mileage } = query;
    const [selectedTrim, setSelectedTrim] = useState(query.trim ?? '');
    const [monthlyUpdates, setMonthlyUpdates] = useState(allowMonthlyUpdates);
    const [response, setResponse] = useState<{ trim: string; value: VehicleValueResult } | null>(null);
    const result = response?.trim === selectedTrim ? response.value : null;
    const health = useHealth();
    const lookup = useVehicleValueLookup();
    const parsed = vehicleValueQuerySchema.safeParse({ ...query, trim: selectedTrim || null });
    const ready = health.data?.providers.find((p) => p.id === 'vinaudit')?.status === 'ready';

    const run = () => {
        if (!parsed.success) return;
        lookup.mutate(parsed.data, { onSuccess: (value) => setResponse({ trim: selectedTrim, value }) });
    };
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
            monthlyVehicleUpdates: monthlyUpdates && allowMonthlyUpdates,
            vehicleTrim: selectedTrim || null,
            method: 'Market value from recent listings, adjusted for mileage, condition, and title',
            conditionAssumption: query.condition ?? '',
            notes: [
                `${what} estimate`,
                v.lowCents != null && v.highCents != null && `range ${formatMoney(v.lowCents)} to ${formatMoney(v.highCents)}`,
                r.mileage != null && `at ${r.mileage.toLocaleString('en-US')} miles`,
                v.sampleCount != null && `from ${v.sampleCount} listings`,
                ...r.notes
            ]
                .filter(Boolean)
                .join('. ')
                .slice(0, 1000)
        });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Gauge className="size-4" />Vehicle market estimate</div>
            <p className="text-xs text-muted-foreground">Use a VIN or year, make, and model. Mileage and trim help refine the estimate.</p>
            {!ready ? (
                <p className="text-sm text-muted-foreground">
                    Needs a VinAudit API key (<code className="text-xs">VINAUDIT_API_KEY</code>). VIN-free estimates also need Vehicle Selections access. See Setup.
                </p>
            ) : !parsed.success ? (
                <p className="text-sm text-muted-foreground">{parsed.error.issues.map((issue) => issue.message).join('. ')}. Go back or edit the vehicle details to get an estimate.</p>
            ) : (
                <div className="space-y-3">
                    {mileage == null && <p className="text-xs text-muted-foreground">No mileage entered, so the estimate will assume average mileage.</p>}
                    <Button type="button" size="sm" variant="outline" onClick={run} disabled={lookup.isPending}>
                        {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Get market value
                    </Button>
                    {!vin && <p className="text-xs text-muted-foreground">{query.year} {query.make} {query.model}. If the trim is unknown, we will name the reference trim used.</p>}
                    {!vin && response?.value.trimSelection && (
                        <Field label="Refine by trim" htmlFor="value-trim" help="Choose your trim, then get an updated estimate.">
                            <OptionalSelect
                                id="value-trim"
                                value={selectedTrim}
                                onChange={setSelectedTrim}
                                placeholder="I'm not sure — use a reference trim"
                                options={response.value.trimSelection.options.map((option) => ({ value: option.name, label: option.name }))}
                            />
                        </Field>
                    )}
                    {lookup.error && <p role="alert" className="text-sm text-destructive">{lookup.error.message}</p>}
                    {result && (
                        <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
                            {result.trimSelection?.assumed && <p className="font-medium">Rough estimate · assumes {result.trimSelection.name} trim</p>}
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
                                                <span className="text-xs text-muted-foreground">{actionLabel}</span>
                                                {actions.map(([text, valueType]) => (
                                                    <Button type="button" key={valueType} size="xs" variant="outline" onClick={() => record(result, kind, valueType)}>
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
                                <div className="flex items-center justify-between gap-3 py-2">
                                    <div>
                                        <Label htmlFor="vehicle-monthly-updates">Update this value monthly</Label>
                                        <p className="mt-1 text-xs text-muted-foreground">Starts when you save this estimate. Uses the last mileage you entered and keeps a dated history.</p>
                                    </div>
                                    <Switch id="vehicle-monthly-updates" checked={monthlyUpdates && allowMonthlyUpdates} disabled={!allowMonthlyUpdates} onCheckedChange={setMonthlyUpdates} />
                                </div>
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
        </div>
    );
}


