// the home value estimate on the add flow's value step. it sends the address from the earlier step to
// rentcast and, if the number looks right, fills in the fair market amount. it only runs on a click,
// since the free plan allows 50 lookups a month (the server caches each address for a day).

import { useState } from 'react';
import { Check, House, LoaderCircle } from 'lucide-react';
import type { PropertyValueResult } from '@shared/schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import { useHealth, usePropertyValueLookup } from '@/hooks/usePortfolio.ts';
import { formatMoney } from '@/lib/format.ts';
import { missingAddressParts, type PropertyValueQuery } from '@/lib/propertyValue.ts';

const SHOW_COMPS = 3;

type Props = { query: PropertyValueQuery; onUse: (result: PropertyValueResult) => void };

// a new address starts fresh, so an old estimate can't be applied to a different house
export function PropertyValueLookup(props: Props) {
    return <PropertyValueLookupBody key={JSON.stringify(props.query)} {...props} />;
}

function PropertyValueLookupBody({ query, onUse }: Props) {
    const health = useHealth();
    const lookup = usePropertyValueLookup();
    const [result, setResult] = useState<PropertyValueResult | null>(null);
    const [used, setUsed] = useState(false);
    const ready = health.data?.providers.find((p) => p.id === 'rentcast')?.status === 'ready';
    const missing = missingAddressParts(query);

    const run = () => {
        setUsed(false);
        lookup.mutate(query, { onSuccess: setResult });
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <House className="size-4" />
                Home value estimate
            </div>
            <p className="text-xs text-muted-foreground">From RentCast, based on the address you entered and nearby sales. Each lookup uses 1 of the 50 free ones a month.</p>
            {health.isLoading ? null : !ready ? (
                <p className="text-sm text-muted-foreground">
                    Needs a RentCast API key (<code className="text-xs">RENTCAST_API_KEY</code>). See Setup.
                </p>
            ) : missing.length > 0 ? (
                <p className="text-sm text-muted-foreground">Go back and add the {missing.join(', ')} to get an estimate.</p>
            ) : (
                <div className="space-y-3">
                    <Button type="button" size="sm" variant="outline" onClick={run} disabled={lookup.isPending}>
                        {lookup.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Get home estimate
                    </Button>
                    {lookup.error && (
                        <p role="alert" className="text-sm text-destructive">
                            {lookup.error.message}
                        </p>
                    )}
                    {result && (
                        <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-lg font-semibold tabular-nums">{result.valueCents != null ? formatMoney(result.valueCents) : 'No estimate'}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{result.providerLabel}</span>
                            </div>
                            {result.lowCents != null && result.highCents != null && (
                                <p className="text-xs text-muted-foreground">
                                    Most likely between {formatMoney(result.lowCents)} and {formatMoney(result.highCents)}
                                </p>
                            )}
                            {result.comparables.length > 0 && (
                                <ul className="space-y-1 border-t pt-2 text-xs">
                                    {result.comparables.slice(0, SHOW_COMPS).map((c, i) => (
                                        <li key={i} className="flex justify-between gap-2">
                                            <span className="truncate text-muted-foreground">{c.address}</span>
                                            <span className="shrink-0 tabular-nums">{c.priceCents != null ? formatMoney(c.priceCents) : ''}</span>
                                        </li>
                                    ))}
                                    {result.comparables.length > SHOW_COMPS && (
                                        <li className="text-muted-foreground">and {result.comparables.length - SHOW_COMPS} more nearby</li>
                                    )}
                                </ul>
                            )}
                            {result.notes.map((n) => (
                                <p key={n} className="text-xs text-muted-foreground">
                                    {n}
                                </p>
                            ))}
                            {result.valueCents != null && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={used ? 'outline' : 'default'}
                                    className="mt-1"
                                    onClick={() => {
                                        onUse(result);
                                        setUsed(true);
                                    }}
                                >
                                    {used && <Check data-icon="inline-start" />}
                                    {used ? 'Filled in below' : 'Use as fair market value'}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
