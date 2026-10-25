// record a dated value: one amount or a low/high range, its type, date, and where it came from.
// also used to save a provider estimate (RentCast) after the user has looked at it.

import { useEffect } from 'react';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { parseMoneyInput } from '@shared/money.ts';
import { CONDITION_LABELS, CONDITIONS, OBSERVED_VALUE_TYPES, VALUE_TYPE_HINTS, VALUE_TYPE_LABELS, type ObservedValueType } from '@shared/schemas.ts';
import { ApiError } from '@/api/api.ts';
import { Segmented } from '@/components/common/Segmented.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useAddValuation } from '@/hooks/usePortfolio.ts';
import { todayIso } from '@/lib/format.ts';
import { Field, MoneyInput, OptionalSelect } from './FormBits.tsx';

export interface ValuationFormValues {
    valueType: ObservedValueType;
    mode: 'amount' | 'range';
    amount: string;
    low: string;
    high: string;
    observedAt: string;
    source: 'user' | 'appraisal' | 'provider';
    sourceName: string;
    method: string;
    conditionAssumption: string;
    notes: string;
    monthlyVehicleUpdates?: boolean;
    vehicleTrim?: string | null;
}

const blank = (): ValuationFormValues => ({
    valueType: 'fair_market',
    mode: 'amount',
    amount: '',
    low: '',
    high: '',
    observedAt: todayIso(),
    source: 'user',
    sourceName: '',
    method: '',
    conditionAssumption: '',
    notes: ''
});

const schema = z.custom<ValuationFormValues>().superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const money = 'Enter a dollar amount, like 1250 or 1,250.00';
    if (v.mode === 'amount') {
        const a = parseMoneyInput(v.amount);
        if (a === undefined) issue('amount', money);
        else if (a === null) issue('amount', 'Enter the amount');
    } else {
        const lo = parseMoneyInput(v.low);
        const hi = parseMoneyInput(v.high);
        if (lo === undefined) issue('low', money);
        else if (lo === null) issue('low', 'Enter the low end');
        if (hi === undefined) issue('high', money);
        else if (hi === null) issue('high', 'Enter the high end');
        if (lo != null && hi != null && lo > hi) issue('high', 'The high end must be at least the low end');
        // optional point estimate inside the range
        if (parseMoneyInput(v.amount) === undefined) issue('amount', money);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.observedAt)) issue('observedAt', 'Add the date this value is from');
    else if (v.observedAt > todayIso()) issue('observedAt', "A value can't be dated in the future");
});

const SOURCE_OPTIONS = [
    { value: 'user', label: 'My own estimate' },
    { value: 'appraisal', label: 'Professional appraisal' },
    { value: 'provider', label: 'Data provider or listing' }
];

export function ValuationDialog({
    assetId,
    open,
    onOpenChange,
    initial,
    title = 'Record a value'
}: {
    assetId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial?: Partial<ValuationFormValues>;
    title?: string;
}) {
    const add = useAddValuation(assetId);
    const form = useForm<ValuationFormValues>({ defaultValues: { ...blank(), ...initial }, resolver: zodResolver(schema) });
    const { register, control, handleSubmit, reset, setError, watch, formState } = form;
    const mode = watch('mode');
    const valueType = watch('valueType');
    const unchangedVehicleEstimate = initial?.monthlyVehicleUpdates !== undefined && watch('source') === 'provider' && watch('sourceName') === initial.sourceName && watch('amount') === initial.amount && valueType === initial.valueType && mode === 'amount';

    // fresh values every time it opens
    useEffect(() => {
        if (open) reset({ ...blank(), ...initial });
    }, [open, initial, reset]);

    const onSubmit = async (v: ValuationFormValues) => {
        try {
            await add.mutateAsync({
                valueType: v.valueType,
                amountCents: parseMoneyInput(v.amount) ?? null,
                lowCents: v.mode === 'range' ? parseMoneyInput(v.low) : null,
                highCents: v.mode === 'range' ? parseMoneyInput(v.high) : null,
                observedAt: v.observedAt,
                source: v.source,
                sourceName: v.sourceName.trim() || null,
                method: v.method.trim() || null,
                conditionAssumption: (v.conditionAssumption || null) as (typeof CONDITIONS)[number] | null,
                notes: v.notes.trim() || null,
                monthlyVehicleUpdates: unchangedVehicleEstimate ? v.monthlyVehicleUpdates : false,
                vehicleTrim: v.vehicleTrim
            });
            toast.success(`${VALUE_TYPE_LABELS[v.valueType]} recorded`);
            onOpenChange(false);
        } catch (err) {
            if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
                const map: Record<string, string> = { amountCents: 'amount', lowCents: 'low', highCents: 'high' };
                for (const [k, m] of Object.entries(err.fieldErrors)) setError((map[k] ?? k) as Path<ValuationFormValues>, { message: m });
            } else {
                toast.error("Couldn't save the value", { description: err instanceof Error ? err.message : undefined });
            }
        }
    };

    const e = formState.errors;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>Each value is saved with its date, so the history builds up over time.</DialogDescription>
                    </DialogHeader>

                    <Field label="Value type" htmlFor="v-type" help={VALUE_TYPE_HINTS[valueType]}>
                        <Controller
                            control={control}
                            name="valueType"
                            render={({ field }) => (
                                <OptionalSelect
                                    id="v-type"
                                    value={field.value}
                                    onChange={(v) => field.onChange(v)}
                                    allowNone={false}
                                    options={OBSERVED_VALUE_TYPES.map((t) => ({ value: t, label: VALUE_TYPE_LABELS[t] }))}
                                />
                            )}
                        />
                    </Field>

                    <div className="space-y-2">
                        <Controller
                            control={control}
                            name="mode"
                            render={({ field }) => (
                                <Segmented
                                    size="sm"
                                    label="Amount or range"
                                    value={field.value}
                                    onChange={field.onChange}
                                    options={[
                                        { value: 'amount', label: 'One amount' },
                                        { value: 'range', label: 'Low to high range' }
                                    ]}
                                />
                            )}
                        />
                        {mode === 'amount' ? (
                            <Field label="Amount" htmlFor="v-amount" error={e.amount?.message}>
                                <MoneyInput id="v-amount" autoFocus {...register('amount')} aria-invalid={Boolean(e.amount) || undefined} />
                            </Field>
                        ) : (
                            <div className="grid grid-cols-3 gap-3">
                                <Field label="Low" htmlFor="v-low" error={e.low?.message}>
                                    <MoneyInput id="v-low" {...register('low')} aria-invalid={Boolean(e.low) || undefined} />
                                </Field>
                                <Field label="Best guess" htmlFor="v-amount" error={e.amount?.message} help="Optional">
                                    <MoneyInput id="v-amount" {...register('amount')} aria-invalid={Boolean(e.amount) || undefined} />
                                </Field>
                                <Field label="High" htmlFor="v-high" error={e.high?.message}>
                                    <MoneyInput id="v-high" {...register('high')} aria-invalid={Boolean(e.high) || undefined} />
                                </Field>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="As of" htmlFor="v-date" error={e.observedAt?.message}>
                            <Input id="v-date" type="date" max={todayIso()} {...register('observedAt')} aria-invalid={Boolean(e.observedAt) || undefined} />
                        </Field>
                        <Field label="Condition assumed" htmlFor="v-condition">
                            <Controller
                                control={control}
                                name="conditionAssumption"
                                render={({ field }) => (
                                    <OptionalSelect id="v-condition" value={field.value} onChange={field.onChange} placeholder="Not stated" options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))} />
                                )}
                            />
                        </Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Source" htmlFor="v-source">
                            <Controller
                                control={control}
                                name="source"
                                render={({ field }) => <OptionalSelect id="v-source" value={field.value} onChange={field.onChange} allowNone={false} options={SOURCE_OPTIONS} />}
                            />
                        </Field>
                        <Field label="Source name" htmlFor="v-sourceName" help="Appraiser, website, dealer...">
                            <Input id="v-sourceName" {...register('sourceName')} maxLength={80} autoComplete="off" />
                        </Field>
                    </div>

                    <Field label="Notes" htmlFor="v-notes">
                        <Textarea id="v-notes" rows={2} {...register('notes')} maxLength={1000} placeholder="Comparable sales, mileage at the time, anything that explains the number" />
                    </Field>
                    {unchangedVehicleEstimate && (
                        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                            <div><Label htmlFor="v-monthly">Update this value monthly</Label><p className="mt-1 text-xs text-muted-foreground">Uses your recorded mileage and adds each update to the history.</p></div>
                            <Controller control={control} name="monthlyVehicleUpdates" render={({ field }) => <Switch id="v-monthly" checked={Boolean(field.value)} onCheckedChange={field.onChange} />} />
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={add.isPending}>
                            {add.isPending && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                            Save value
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
