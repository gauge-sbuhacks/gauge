// add an asset one question at a time, like onboarding: pick a category, then answer the questions
// that category needs. only the category and a name are required, so after "what is it" every step
// can be skipped, or you can save right there. editing an existing asset keeps the full form
// (AssetFormView), since fixing one field shouldn't mean clicking through every step.

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Path, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useBlocker, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, LoaderCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getCategory, usesCommonField, type CategoryId } from '@shared/categories.ts';
import { parseMoneyInput } from '@shared/money.ts';
import {
    CONDITION_HINTS,
    CONDITION_LABELS,
    CONDITIONS,
    OBSERVED_VALUE_TYPES,
    PRICE_CHECK_SOURCE,
    VALUE_TYPE_HINTS,
    VALUE_TYPE_LABELS,
    type EstimateInput,
    type LookupSuggestion,
    type ObservedValueType,
    type PropertyValueResult,
    type VinLookupResult
} from '@shared/schemas.ts';
import { ApiError } from '@/api/api.ts';
import { CategoryFields } from '@/components/assets/CategoryFields.tsx';
import { MascotQuestion } from '@/components/brand/MascotQuestion.tsx';
import { RailProgress } from '@/components/brand/Railway.tsx';
import { Gus, type GusPose } from '@/components/brand/Mascots.tsx';
import { CategoryPicker } from '@/components/assets/CategoryPicker.tsx';
import { Field, MoneyInput, NameSuggestion, OptionalSelect } from '@/components/assets/FormBits.tsx';
import { PropertyValueLookup } from '@/components/assets/PropertyValueLookup.tsx';
import { SuggestionReview } from '@/components/assets/SuggestionReview.tsx';
import { VehicleValueLookup } from '@/components/assets/VehicleValueLookup.tsx';
import type { ValuationFormValues } from '@/components/assets/ValuationDialog.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { useCreateAsset, usePortfolio, useSuggestValues, useVinLookup } from '@/hooks/usePortfolio.ts';
import type { SuggestValuesResult } from '@shared/schemas.ts';
import { centsToInput } from '@shared/money.ts';
import { suggestQueryFromForm } from '@/lib/suggestValues.ts';
import { DEFAULT_LOCATIONS, assetFormSchema, emptyFormValues, formFieldForServerKey, suggestedName, toPayload, type AssetFormValues } from '@/lib/assetForm.ts';
import {
    detailKeys,
    detailsCopy,
    fieldsForStep,
    identityCopy,
    identityFields,
    stepForField,
    stepsFor,
    type IdentityField,
    type StepId
} from '@/lib/addAssetSteps.ts';
import { formatMoney, todayIso } from '@/lib/format.ts';
import { distinctLocations } from '@/lib/portfolio.ts';
import { propertyValueQueryFor } from '@/lib/propertyValue.ts';
import { cn } from '@/lib/utils.ts';
import { vehicleValueQueryFor } from '@/lib/vehicleValue.ts';

const LEAVE_MS = 220;
const STATION_LABELS: Record<StepId, string> = { category: 'Category', identity: 'Item', details: 'Details', condition: 'Condition', money: 'Value', proof: 'Proof' };

// one line on where an automatic value came from, in plain words
function roughEstimateNote(sourceName: string): string {
    if (sourceName === PRICE_CHECK_SOURCE) return 'We ran an AI price check on the details you entered, so treat it as a ballpark, not a quote.';
    if (sourceName === 'gold-api.com') return "It's the melt value of the metal at today's spot price. Jewelry often sells for more because of its design, brand, or stones.";
    if (sourceName.startsWith('VinAudit')) return "It's from VinAudit's market data for similar vehicles.";
    if (sourceName.startsWith('eBay')) return 'It comes from current eBay asking prices, which usually run higher than what things sell for.';
    return `It comes from ${sourceName}.`;
}

// what a provider estimate (VinAudit for cars, RentCast for homes) was based on. if the details change
// after it was filled in, the saved value no longer claims to come from the provider
function providerSignatureFor(v: AssetFormValues): string {
    return JSON.stringify(v.category === 'property' ? propertyValueQueryFor(v.details) : vehicleValueQueryFor(v));
}

// Gus asks every question: calm while asking, alarmed when an answer needs fixing, and stamping the
// certificate on the last step
function gusPoseFor(step: StepId, isLast: boolean, hasError: boolean): GusPose {
    if (hasError) return 'alarm';
    return isLast && step !== 'category' ? 'certify' : 'calm';
}

export default function AddAssetView() {
    const portfolio = usePortfolio();
    if (portfolio.isLoading) return <LoadingBlock />;
    if (portfolio.error) return <ErrorPanel error={portfolio.error} onRetry={() => portfolio.refetch()} />;
    const locations = [...new Set([...distinctLocations(portfolio.items ?? []), ...DEFAULT_LOCATIONS])];
    return <AddAssetFlow locations={locations} />;
}

function AddAssetFlow({ locations }: { locations: string[] }) {
    const navigate = useNavigate();
    const create = useCreateAsset();
    const vinLookup = useVinLookup();
    const suggestValues = useSuggestValues();
    const [vinResult, setVinResult] = useState<VinLookupResult | null>(null);
    const saved = useRef(false);

    const form = useForm<AssetFormValues>({ defaultValues: emptyFormValues(), resolver: zodResolver(assetFormSchema), mode: 'onTouched' });
    const { register, control, setValue, getValues, setError, trigger, clearErrors, formState } = form;
    const { errors, isDirty } = formState;
    const values = useWatch({ control }) as AssetFormValues;
    const category = values.category as CategoryId | '';
    const vehicleQuery = vehicleValueQueryFor(values);
    const vehicleSignature = JSON.stringify(vehicleQuery);
    const [providerEstimate, setProviderEstimate] = useState<{ signature: string; estimate: EstimateInput } | null>(null);
    const def = category ? getCategory(category) : null;

    // ---------- steps and transitions (same feel as onboarding) ----------
    const steps = useMemo(() => stepsFor(values), [values]);
    const [stepId, setStepId] = useState<StepId>('category');
    const [dir, setDir] = useState<1 | -1>(1);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const stage = useRef<HTMLDivElement>(null);
    const suggestSigRef = useRef('');
    const suggestMetaRef = useRef<Pick<SuggestValuesResult, 'fairMarket' | 'quickSale'> | null>(null);
    const [valueHint, setValueHint] = useState<string | null>(null);
    // the fair market amount we filled in and where it came from, so the step can call it a rough estimate
    const [autoFilled, setAutoFilled] = useState<{ cents: number; sourceName: string; quickIs85: boolean } | null>(null);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const applySuggestedValues = (result: SuggestValuesResult) => {
        suggestMetaRef.current = { fairMarket: result.fairMarket, quickSale: result.quickSale };
        let fairFilled = false;
        let quickFilled = false;
        if (parseMoneyInput(getValues('estimateAmount')) == null && result.fairMarket) {
            setValue('estimateType', 'fair_market', { shouldDirty: true });
            setValue('estimateAmount', centsToInput(result.fairMarket.amountCents), { shouldDirty: true, shouldValidate: true });
            setValue('estimateDate', todayIso(), { shouldDirty: true });
            fairFilled = true;
        }
        if (parseMoneyInput(getValues('quickSaleAmount')) == null && result.quickSale) {
            setValue('quickSaleAmount', centsToInput(result.quickSale.amountCents), { shouldDirty: true, shouldValidate: true });
            setValue('quickSaleDate', todayIso(), { shouldDirty: true });
            quickFilled = true;
        }
        if (fairFilled && result.fairMarket) {
            // melt and the price check set quick-sale to 85% of fair market; VinAudit and card prices have their own
            const quickIs85 = quickFilled && result.quickSale != null && Math.abs(result.quickSale.amountCents - Math.round(result.fairMarket.amountCents * 0.85)) <= 1;
            setAutoFilled({ cents: result.fairMarket.amountCents, sourceName: result.fairMarket.sourceName, quickIs85 });
            setValueHint(null);
        } else if (quickFilled) {
            setValueHint('Quick-sale was filled in with a rough estimate. Change it if you know better.');
        } else if (!result.fairMarket && !result.quickSale) {
            setValueHint(result.lookupMessage ?? 'No automatic price yet. Enter values or save to retry on the server.');
        }
    };

    useEffect(() => {
        if (stepId !== 'money' || leaving || !category || category === 'property') return;
        const q = suggestQueryFromForm(getValues());
        if (!q) return;
        const hasFair = parseMoneyInput(getValues('estimateAmount')) != null;
        const hasQuick = parseMoneyInput(getValues('quickSaleAmount')) != null;
        if (hasFair && hasQuick) return;
        const sig = JSON.stringify(q);
        if (sig === suggestSigRef.current) return;
        suggestSigRef.current = sig;
        suggestValues.mutate(q, { onSuccess: applySuggestedValues });
    }, [stepId, leaving, category, values.name, values.brand, values.model, values.condition, values.details, values.estimateAmount, values.quickSaleAmount]);

    const index = Math.max(0, steps.indexOf(stepId));
    const isLast = index === steps.length - 1;

    const go = (next: StepId) => {
        if (leaving || next === stepId) return;
        setDir(steps.indexOf(next) > index ? 1 : -1);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setStepId(next);
            return;
        }
        setLeaving(true);
        timer.current = window.setTimeout(() => {
            setStepId(next);
            setLeaving(false);
        }, LEAVE_MS);
    };

    // each new question puts the cursor in its first box
    useEffect(() => {
        if (leaving) return;
        const first = stage.current?.querySelector<HTMLElement>('input:not([type=hidden]), textarea, [role=combobox], [role=radio]');
        first?.focus({ preventScroll: true });
    }, [stepId, leaving]);

    // ---------- leaving with unsaved changes ----------
    const blocker = useBlocker(({ currentLocation, nextLocation }) => !saved.current && isDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (!isDirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [isDirty]);

    // ---------- moving between steps ----------
    const nameSuggestion = !values.name?.trim() ? suggestedName(values) : null;

    const next = async () => {
        if (stepId === 'identity' && !getValues('name').trim()) {
            // "2020 Cadillac XT6" or the street address, so nobody has to type a name twice
            const suggestion = suggestedName(getValues());
            if (suggestion) setValue('name', suggestion, { shouldDirty: true });
        }
        const ok = await trigger(fieldsForStep(stepId, getValues()) as Path<AssetFormValues>[]);
        if (!ok) return;
        if (isLast) return save();
        go(steps[index + 1]);
    };

    const skip = () => {
        // skipping clears this step's mistakes so they don't block saving later
        clearErrors(fieldsForStep(stepId, getValues()) as Path<AssetFormValues>[]);
        if (isLast) return save();
        go(steps[index + 1]);
    };

    const back = () => index > 0 && go(steps[index - 1]);

    const pickCategory = (id: CategoryId) => {
        setValue('category', id, { shouldDirty: true, shouldValidate: true });
        setVinResult(null);
        go('identity');
    };

    // ---------- save ----------
    const save = async () => {
        const ok = await trigger();
        if (!ok) {
            // jump to the first step with a problem
            const firstBad = Object.keys(form.formState.errors)[0];
            const path = firstBad === 'details' ? `details.${Object.keys(form.formState.errors.details ?? {})[0]}` : firstBad;
            const target = path ? stepForField(path, getValues()) : null;
            if (target) go(target);
            toast.error('Something needs a fix before saving');
            return;
        }
        try {
            let current = getValues();
            if (current.category && current.category !== 'property') {
                const needsFair = parseMoneyInput(current.estimateAmount) == null;
                const needsQuick = parseMoneyInput(current.quickSaleAmount) == null;
                if (needsFair || needsQuick) {
                    const q = suggestQueryFromForm(current);
                    if (q) {
                        try {
                            const suggested = await suggestValues.mutateAsync(q);
                            applySuggestedValues(suggested);
                            current = getValues();
                        } catch {
                            /* create route also fills missing estimates */
                        }
                    }
                }
            }
            const payload = toPayload(current, suggestMetaRef.current);
            const selected = providerEstimate?.estimate;
            if (
                (current.category === 'vehicle' || current.category === 'property') &&
                providerEstimate?.signature === providerSignatureFor(current) &&
                selected &&
                payload.estimate?.amountCents === selected.amountCents &&
                payload.estimate.valueType === selected.valueType &&
                payload.estimate.observedAt === selected.observedAt
            ) {
                payload.estimate = selected;
            }
            const res = await create.mutateAsync(payload);
            saved.current = true;
            toast.success(`${res.asset.name} added`, { icon: <Gus pose="certify" size={22} /> });
            navigate(`/assets/${res.asset.id}`);
        } catch (err) {
            if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
                let target: StepId | null = null;
                for (const [key, message] of Object.entries(err.fieldErrors)) {
                    const field = formFieldForServerKey(key);
                    setError(field as Path<AssetFormValues>, { message });
                    target ??= stepForField(field, getValues());
                }
                if (target) go(target);
                toast.error('Something needs a fix before saving');
            } else {
                // network or server trouble: everything stays on screen so nothing is lost
                toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined });
            }
        }
    };

    // ---------- vin decode ----------
    const decodeVin = () => {
        const vin = (getValues('details.vin') ?? '').trim();
        if (vin.length < 11) {
            setError('details.vin', { message: 'Enter at least the first 11 characters of the VIN' });
            return;
        }
        vinLookup.mutate(vin, {
            onSuccess: (r) => setVinResult(r),
            onError: (err) => {
                if (err instanceof ApiError && err.fieldErrors.vin) setError('details.vin', { message: err.fieldErrors.vin });
                else toast.error('VIN lookup failed', { description: err.message });
            }
        });
    };
    const applySuggestions = (chosen: LookupSuggestion[]) => {
        const setText = setValue as (name: Path<AssetFormValues>, value: string, opts: { shouldDirty: boolean; shouldValidate: boolean }) => void;
        for (const s of chosen) setText(s.field as Path<AssetFormValues>, String(s.value), { shouldDirty: true, shouldValidate: true });
        setVinResult(null);
        toast.success(`Filled in ${chosen.length} field${chosen.length === 1 ? '' : 's'} from NHTSA`);
    };
    const currentFormValue = (field: string): string => {
        const v = getValues(field as Path<AssetFormValues>);
        return typeof v === 'string' ? v : '';
    };

    const busy = create.isPending;
    const applyVehicleEstimate = (initial: Partial<ValuationFormValues>) => {
        if (!initial.amount || !initial.valueType || !initial.observedAt) return;
        const amountCents = parseMoneyInput(initial.amount);
        if (amountCents == null) return;
        setValue('estimateAmount', initial.amount, { shouldDirty: true, shouldValidate: true });
        setValue('estimateType', initial.valueType, { shouldDirty: true });
        setValue('estimateDate', initial.observedAt, { shouldDirty: true });
        setProviderEstimate({
            signature: vehicleSignature,
            estimate: {
                valueType: initial.valueType,
                amountCents,
                observedAt: initial.observedAt,
                source: 'provider',
                sourceName: initial.sourceName,
                monthlyVehicleUpdates: initial.monthlyVehicleUpdates,
                vehicleTrim: initial.vehicleTrim,
                method: initial.method,
                conditionAssumption: values.condition || null,
                notes: initial.notes
            }
        });
        toast.success('Estimate filled in. Save the vehicle to record it.');
    };
    const applyPropertyEstimate = (r: PropertyValueResult) => {
        if (r.valueCents == null) return;
        const observedAt = todayIso();
        setValue('estimateType', 'fair_market', { shouldDirty: true });
        setValue('estimateAmount', centsToInput(r.valueCents), { shouldDirty: true, shouldValidate: true });
        setValue('estimateDate', observedAt, { shouldDirty: true, shouldValidate: true });
        setProviderEstimate({
            signature: providerSignatureFor(getValues()),
            estimate: {
                valueType: 'fair_market',
                amountCents: r.valueCents,
                observedAt,
                source: 'provider',
                sourceName: 'RentCast AVM',
                method: 'Automated valuation from nearby comparable homes',
                conditionAssumption: null,
                vehicleTrim: null,
                notes: [
                    'Automated estimate',
                    r.lowCents != null && r.highCents != null && `Range ${formatMoney(r.lowCents)} to ${formatMoney(r.highCents)}`,
                    r.comparables.length > 0 && `Based on ${r.comparables.length} nearby listings`,
                    ...r.notes
                ]
                    .filter(Boolean)
                    .join('. ')
                    .slice(0, 1000)
            }
        });
        toast.success('Home estimate filled in. Save the property to record it.');
    };
    const canSaveEarly = index >= 2 && Boolean(values.name?.trim());

    // does this step have a mistake showing? (Gus looks alarmed until it's fixed)
    const stepHasError = fieldsForStep(stepId, values).some((field) => {
        const [head, key] = field.split('.');
        const err = (errors as Record<string, unknown>)[head];
        return key ? Boolean((err as Record<string, unknown> | undefined)?.[key]) : Boolean(err);
    });

    // ---------- the questions ----------
    let question: string;
    let help: string;
    let body: ReactNode;
    let optional = true;

    if (stepId === 'category' || !category || !def) {
        question = 'What are you adding?';
        help = 'Pick the closest one. It decides what we ask next.';
        optional = false;
        body = <CategoryPicker roomy value={category} onChange={pickCategory} invalid={Boolean(errors.category)} />;
    } else if (stepId === 'identity') {
        const copy = identityCopy(category);
        question = copy.question;
        help = copy.help;
        optional = false;
        body = (
            <div className="space-y-5">
                <IdentityInputs form={form} category={category} onDecodeVin={decodeVin} decoding={vinLookup.isPending} />
                {vinResult && (
                    <SuggestionReview
                        key={vinResult.fetchedAt + vinResult.vin}
                        providerLabel={vinResult.providerLabel}
                        fetchedAt={vinResult.fetchedAt}
                        suggestions={vinResult.suggestions}
                        specs={vinResult.specs}
                        warnings={vinResult.warnings}
                        currentValue={currentFormValue}
                        onApply={applySuggestions}
                        onDismiss={() => setVinResult(null)}
                    />
                )}
                <Field
                    label="Name"
                    htmlFor="name"
                    optional={false}
                    error={errors.name?.message}
                    help={nameSuggestion ? undefined : 'What you will see in your list, like "Grandpa\'s Omega"'}
                >
                    <Input id="name" {...register('name')} maxLength={120} autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} />
                    {nameSuggestion && <NameSuggestion name={nameSuggestion} onUse={() => setValue('name', nameSuggestion, { shouldDirty: true, shouldValidate: true })} />}
                </Field>
            </div>
        );
    } else if (stepId === 'details') {
        const copy = detailsCopy(category);
        question = copy.question;
        help = `${copy.help} All optional.`;
        body = <CategoryFields form={form} category={category} keys={detailKeys(category)} />;
    } else if (stepId === 'condition') {
        const askCondition = usesCommonField(category, 'condition');
        const askLocation = usesCommonField(category, 'location');
        question = askCondition && askLocation ? 'What shape is it in, and where is it kept?' : askCondition ? 'What shape is it in?' : 'Where is it kept?';
        help = askCondition ? 'Condition changes what it would sell for.' : 'Helps when you are looking for it, or listing it for insurance.';
        body = (
            <div className="space-y-6">
                {askCondition && (
                    <Field label="Condition" error={errors.condition?.message} help={values.condition ? CONDITION_HINTS[values.condition] : 'Tap again to clear'}>
                        <Controller
                            control={control}
                            name="condition"
                            render={({ field }) => (
                                <div role="radiogroup" aria-label="Condition" className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-5">
                                    {CONDITIONS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            role="radio"
                                            aria-checked={field.value === c}
                                            onClick={() => field.onChange(field.value === c ? '' : c)}
                                            className={cn(
                                                'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                                                field.value === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                                            )}
                                        >
                                            {CONDITION_LABELS[c]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        />
                    </Field>
                )}
                {askLocation && (
                    <Field label="Where it's kept" htmlFor="location" error={errors.location?.message}>
                        <Input id="location" list="location-options" {...register('location')} maxLength={80} autoComplete="off" placeholder="Home office" />
                        <datalist id="location-options">
                            {locations.map((l) => (
                                <option key={l} value={l} />
                            ))}
                        </datalist>
                    </Field>
                )}
            </div>
        );
    } else if (stepId === 'money') {
        question = 'What did you pay, and what is it worth now?';
        help =
            category === 'property'
                ? 'Leave anything you don\'t know blank. Get a home value estimate below, or type in your own.'
                : 'Leave anything you don\'t know blank. It shows as "Not entered", never $0.';
        body = (
            <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Purchase price" htmlFor="purchasePrice" error={errors.purchasePrice?.message} help="Your cost basis">
                        <MoneyInput id="purchasePrice" {...register('purchasePrice')} aria-invalid={Boolean(errors.purchasePrice) || undefined} />
                    </Field>
                    <Field label="Purchase date" htmlFor="purchaseDate" error={errors.purchaseDate?.message}>
                        <Input id="purchaseDate" type="date" max={todayIso()} {...register('purchaseDate')} aria-invalid={Boolean(errors.purchaseDate) || undefined} />
                    </Field>
                </div>
                {category === 'vehicle' && <VehicleValueLookup query={vehicleQuery} onRecord={applyVehicleEstimate} actionLabel="Use estimate as" />}
                {category === 'property' && <PropertyValueLookup query={propertyValueQueryFor(values.details ?? {})} onUse={applyPropertyEstimate} />}
                <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium">Current value</p>
                    <p className="text-xs text-muted-foreground">
                        {category === 'property'
                            ? 'Use the home estimate above, or type your own. Saved as the first point in its value history.'
                            : suggestValues.isPending
                              ? 'Looking up a rough estimate from what you entered…'
                              : 'We fill in a rough estimate when we can (metal melt, VinAudit, card prices, or an AI price check). Saved as the first point in its value history.'}
                    </p>
                    {autoFilled && !suggestValues.isPending && parseMoneyInput(values.estimateAmount) === autoFilled.cents && (
                        <div className="mt-3 flex gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                            <p>
                                <span className="font-semibold text-foreground">Rough estimate.</span> {roughEstimateNote(autoFilled.sourceName)}
                                {autoFilled.quickIs85 ? ' Quick-sale is set to about 85% of it.' : ''} Change it if you know better.
                            </p>
                        </div>
                    )}
                    {valueHint && !suggestValues.isPending && <p className="mt-2 text-xs text-muted-foreground">{valueHint}</p>}
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <Field label="Value type" htmlFor="estimateType" help={VALUE_TYPE_HINTS[values.estimateType]}>
                            <Controller
                                control={control}
                                name="estimateType"
                                render={({ field }) => (
                                    <OptionalSelect
                                        id="estimateType"
                                        value={field.value}
                                        onChange={(v) => field.onChange(v as ObservedValueType)}
                                        allowNone={false}
                                        options={OBSERVED_VALUE_TYPES.map((t) => ({ value: t, label: VALUE_TYPE_LABELS[t] }))}
                                    />
                                )}
                            />
                        </Field>
                        <Field label="Amount" htmlFor="estimateAmount" error={errors.estimateAmount?.message}>
                            <MoneyInput id="estimateAmount" {...register('estimateAmount')} aria-invalid={Boolean(errors.estimateAmount) || undefined} />
                        </Field>
                        <Field label="As of" htmlFor="estimateDate" error={errors.estimateDate?.message}>
                            <Input id="estimateDate" type="date" max={todayIso()} {...register('estimateDate')} aria-invalid={Boolean(errors.estimateDate) || undefined} />
                        </Field>
                    </div>
                </div>
                <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium">Quick-sale value</p>
                    <p className="text-xs text-muted-foreground">What you could get in a fast sale (dealer, pawn, or melt).</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Field label="Amount" htmlFor="quickSaleAmount" error={errors.quickSaleAmount?.message}>
                            <MoneyInput id="quickSaleAmount" {...register('quickSaleAmount')} aria-invalid={Boolean(errors.quickSaleAmount) || undefined} />
                        </Field>
                        <Field label="As of" htmlFor="quickSaleDate" error={errors.quickSaleDate?.message}>
                            <Input id="quickSaleDate" type="date" max={todayIso()} {...register('quickSaleDate')} aria-invalid={Boolean(errors.quickSaleDate) || undefined} />
                        </Field>
                    </div>
                </div>
            </div>
        );
    } else {
        const askSerial = usesCommonField(category, 'serialNumber');
        question = askSerial ? 'Anything that proves it is yours?' : 'Anything else worth remembering?';
        help = askSerial ? 'A serial number and a few notes make an insurance claim much easier.' : 'Where you bought it, repairs, stories. All optional.';
        body = (
            <div className="space-y-5">
                {askSerial && (
                    <Field label="Serial number or other ID" htmlFor="serialNumber" error={errors.serialNumber?.message}>
                        <Input id="serialNumber" {...register('serialNumber')} maxLength={80} autoComplete="off" spellCheck={false} className="font-mono" />
                    </Field>
                )}
                <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
                    <Textarea id="notes" {...register('notes')} rows={4} maxLength={4000} placeholder="Where you bought it, repairs, stories" />
                </Field>
            </div>
        );
    }

    const stageClass = leaving
        ? cn('animate-out fade-out duration-200 ease-in fill-mode-forwards', dir === 1 ? 'slide-out-to-top-4' : 'slide-out-to-bottom-4')
        : cn('animate-in fade-in duration-500 ease-out fill-mode-both', dir === 1 ? 'slide-in-from-bottom-6' : 'slide-in-from-top-6');

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (stepId === 'category') return;
        void next();
    };

    return (
        <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between text-sm">
                <Link to="/assets" className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="size-3.5" />
                    Assets
                </Link>
                {def && <span className="text-muted-foreground">Adding: {def.singular.toLowerCase()}</span>}
            </div>

            <RailProgress current={index} stops={steps.map((step) => STATION_LABELS[step])} label="Add asset progress" className="mt-6" />

            <div ref={stage} key={stepId} className={cn('py-10 motion-reduce:animate-none sm:py-14', stageClass)}>
                <MascotQuestion pose={gusPoseFor(stepId, isLast, stepHasError)} question={question} help={help} />

                <div className="mt-8">{body}</div>

                {stepId !== 'category' && (
                    <div className="mt-10 flex flex-wrap items-center gap-2">
                        <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
                            {isLast ? 'Save asset' : 'Continue'}
                            {busy ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : isLast ? <Check data-icon="inline-end" /> : <ArrowRight data-icon="inline-end" />}
                        </Button>
                        <Button type="button" variant="ghost" size="lg" className="h-10 px-3" onClick={back} disabled={busy}>
                            <ArrowLeft data-icon="inline-start" />
                            Back
                        </Button>
                        {optional && !isLast && (
                            <Button type="button" variant="ghost" size="lg" className="h-10 px-3 text-muted-foreground" onClick={skip} disabled={busy}>
                                Skip
                            </Button>
                        )}
                        <div className="ml-auto flex items-center gap-4">
                            {canSaveEarly && !isLast && (
                                <button type="button" onClick={() => void save()} disabled={busy} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                                    Save now
                                </button>
                            )}
                            {/* the notes box uses Enter for new lines */}
                            {stepId !== 'proof' && (
                                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                                    press Enter
                                    <CornerDownLeft className="size-3" />
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <AlertDialog open={blocker.state === 'blocked'}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
                        <AlertDialogDescription>This asset hasn't been saved yet.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep going</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
                            Discard it
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}

// the identity step's inputs, in the category's order: shared brand / model boxes mixed with the
// category's own fields (VIN and year for a car, the address for a house)
function IdentityInputs({ form, category, onDecodeVin, decoding }: { form: UseFormReturn<AssetFormValues>; category: CategoryId; onDecodeVin: () => void; decoding: boolean }) {
    const def = getCategory(category);
    const errors = form.formState.errors;

    // group neighbouring category fields so they share one grid
    const groups: (IdentityField | string[])[] = [];
    for (const f of identityFields(category)) {
        if (f.startsWith('details.')) {
            const last = groups[groups.length - 1];
            if (Array.isArray(last)) last.push(f.slice('details.'.length));
            else groups.push([f.slice('details.'.length)]);
        } else groups.push(f);
    }

    const out: ReactNode[] = [];
    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (Array.isArray(g)) {
            out.push(
                <CategoryFields
                    key={g.join()}
                    form={form}
                    category={category}
                    keys={g}
                    onDecodeVin={category === 'vehicle' ? onDecodeVin : undefined}
                    decoding={decoding}
                />
            );
        } else if (g === 'brand' && groups[i + 1] === 'model') {
            // brand and model sit side by side
            out.push(
                <div key="brand-model" className="grid gap-4 sm:grid-cols-2">
                    <Field label={def.brandLabel} htmlFor="brand" error={errors.brand?.message}>
                        <Input id="brand" {...form.register('brand')} maxLength={80} autoComplete="off" />
                    </Field>
                    <Field label={def.modelLabel} htmlFor="model" error={errors.model?.message}>
                        <Input id="model" {...form.register('model')} maxLength={120} autoComplete="off" />
                    </Field>
                </div>
            );
            i++;
        } else {
            const key = g as 'brand' | 'model';
            out.push(
                <Field key={key} label={key === 'brand' ? def.brandLabel : def.modelLabel} htmlFor={key} error={errors[key]?.message}>
                    <Input id={key} {...form.register(key)} maxLength={120} autoComplete="off" />
                </Field>
            );
        }
    }
    return <div className="space-y-5">{out}</div>;
}
