// review lookup suggestions before applying them. empty fields are pre-checked; anything that would
// replace something you already typed starts unchecked and shows the current value, so nothing
// gets silently overwritten.

import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import type { LookupSuggestion } from '@shared/schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { formatDate } from '@/lib/format.ts';

export interface SuggestionReviewProps {
    providerLabel: string;
    fetchedAt: string;
    suggestions: LookupSuggestion[];
    specs?: { label: string; value: string }[];
    warnings?: string[];
    currentValue: (field: string) => string;
    onApply: (chosen: LookupSuggestion[]) => void;
    onDismiss: () => void;
    applying?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

export function SuggestionReview({ providerLabel, fetchedAt, suggestions, specs, warnings, currentValue, onApply, onDismiss, applying }: SuggestionReviewProps) {
    // set once per lookup result (the parent passes a new `key` for each result)
    const [checked, setChecked] = useState<Record<string, boolean>>(() => {
        const init: Record<string, boolean> = {};
        for (const s of suggestions) {
            const cur = currentValue(s.field);
            init[s.field] = cur === '' || norm(cur) === norm(String(s.value));
        }
        return init;
    });

    const chosen = suggestions.filter((s) => checked[s.field]);
    const changes = chosen.filter((s) => norm(currentValue(s.field)) !== norm(String(s.value)));

    return (
        <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Suggested by {providerLabel}</p>
                <p className="text-xs text-muted-foreground">{formatDate(fetchedAt.slice(0, 10))}</p>
            </div>

            {warnings && warnings.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {warnings.map((w) => (
                        <li key={w} className="flex items-start gap-1.5 text-xs text-[#9a6a00]">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                            {w}
                        </li>
                    ))}
                </ul>
            )}

            <ul className="mt-2 divide-y divide-border">
                {suggestions.map((s) => {
                    const cur = currentValue(s.field);
                    const same = norm(cur) === norm(String(s.value));
                    const id = `sugg-${s.field}`;
                    return (
                        <li key={s.field} className="flex items-center gap-3 py-2">
                            <Checkbox id={id} checked={checked[s.field] ?? false} onCheckedChange={(v) => setChecked((c) => ({ ...c, [s.field]: v === true }))} />
                            <label htmlFor={id} className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
                                <span className="text-muted-foreground">{s.label}</span>
                                <span className="font-medium">{s.display}</span>
                                {same ? (
                                    <span className="inline-flex items-center gap-0.5 text-xs text-gain">
                                        <Check className="size-3" /> matches
                                    </span>
                                ) : (
                                    cur !== '' && <span className="text-xs text-muted-foreground">(currently {cur})</span>
                                )}
                            </label>
                        </li>
                    );
                })}
            </ul>

            {specs && specs.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2 text-xs sm:grid-cols-3">
                    {specs.map((s) => (
                        <div key={s.label}>
                            <dt className="text-muted-foreground">{s.label}</dt>
                            <dd>{s.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => onApply(chosen)} disabled={chosen.length === 0 || applying}>
                    {changes.length > 0 ? `Apply ${changes.length} change${changes.length === 1 ? '' : 's'}` : 'Apply'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                    Dismiss
                </Button>
                <p className="text-xs text-muted-foreground">Only checked fields are changed.</p>
            </div>
        </div>
    );
}
