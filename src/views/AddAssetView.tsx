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
    VALUE_TYPE_HINTS,
    VALUE_TYPE_LABELS,
    type EstimateInput,
    type LookupSuggestion,
    type ObservedValueType,
    type VinLookupResult
} from '@shared/schemas.ts';
import { ApiError } from '@/api/api.ts';
import { CategoryFields } from '@/components/assets/CategoryFields.tsx';
import { CategoryPicker } from '@/components/assets/CategoryPicker.tsx';
import { Field, MoneyInput, OptionalSelect } from '@/components/assets/FormBits.tsx';
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
import { WatchLookupCard } from '@/components/assets/WatchLookupCard.tsx';
import { useCreateAsset, usePortfolio, useVinLookup, useWatchSearchLookup, useWatchValueLookup } from '@/hooks/usePortfolio.ts';
import type { WatchSearchResult, WatchValueResult } from '@shared/schemas.ts';
import { centsToInput } from '@shared/money.ts';
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
import { todayIso } from '@/lib/format.ts';
import { distinctLocations } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';
import { vehicleValueQueryFor } from '@/lib/vehicleValue.ts';

const LEAVE_MS = 220;

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
    const watchSearch = useWatchSearchLookup();
    const watchValue = useWatchValueLookup();
    const [vinResult, setVinResult] = useState<VinLookupResult | null>(null);
    const [watchSearchResult, setWatchSearchResult] = useState<WatchSearchResult | null>(null);
    const [watchPriceResult, setWatchPriceResult] = useState<WatchValueResult | null>(null);
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
    useEffect(() => () => window.clearTimeout(timer.current), []);

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
            const current = getValues();
            const payload = toPayload(current);
            const selected = providerEstimate?.estimate;
            if (
                current.category === 'vehicle' &&
                providerEstimate?.signature === JSON.stringify(vehicleValueQueryFor(current)) &&
                selected &&
                payload.estimate?.amountCents === selected.amountCents &&
                payload.estimate.valueType === selected.valueType &&
                payload.estimate.observedAt === selected.observedAt
            ) {
                payload.estimate = selected;
            }
            const res = await create.mutateAsync(payload);
            saved.current = true;
            toast.success(`${res.asset.name} added`);
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
    const watchLookupQuery = () => ({
        brand: (getValues('brand') ?? '').trim(),
        reference: (getValues('details.referenceNumber') ?? '').trim() || undefined,
        model: (getValues('model') ?? '').trim() || undefined,
        name: (getValues('name') ?? '').trim() || undefined
    });

    const lookupWatchReference = () => {
        const q = watchLookupQuery();
        if (!q.brand) {
            toast.error('Add the brand first');
            return;
        }
        const ref = q.reference?.trim() ?? '';
        const model = q.model?.trim() ?? '';
        const name = q.name?.trim() ?? '';
        if (ref.length < 3 && model.length < 2 && name.length < 3) {
            setError('details.referenceNumber', { message: 'Add a reference, model, or name to search' });
            return;
        }
        watchSearch.mutate(q, {
            onSuccess: (r) => {
                setWatchSearchResult(r);
                setWatchPriceResult(null);
            },
            onError: (err) => toast.error('Watch search failed', { description: err.message })
        });
    };

    const fetchWatchPrices = () => {
        const q = watchLookupQuery();
        if (!q.brand) {
            toast.error('Add the brand first');
            return;
        }
        if (!(q.reference || (q.model && q.model.length >= 2) || (q.name && q.name.length >= 3))) {
            toast.error('Add a reference, model, or name to price');
            return;
        }
        watchValue.mutate(q, {
            onSuccess: setWatchPriceResult,
            onError: (err) => toast.error('Watch price lookup failed', { description: err.message })
        });
    };

    const applyWatchMatch = (index: number) => {
        const match = watchSearchResult?.matches[index];
        if (!match) return;
        setValue('brand', match.brand, { shouldDirty: true, shouldValidate: true });
        if (match.model) setValue('model', match.model, { shouldDirty: true, shouldValidate: true });
        if (match.referenceNumber !== '—') {
            setValue('details.referenceNumber', match.referenceNumber, { shouldDirty: true, shouldValidate: true });
        }
        if (match.movement) setValue('details.movement', match.movement, { shouldDirty: true, shouldValidate: true });
        if (match.caseSizeMm != null) setValue('details.caseSizeMm', String(match.caseSizeMm), { shouldDirty: true, shouldValidate: true });
        toast.success('Filled watch details from The Watch API');
    };

    const applyWatchPrices = () => {
        if (!watchPriceResult?.fairMarketCents) return;
        setValue('estimateType', 'fair_market', { shouldDirty: true });
        setValue('estimateAmount', centsToInput(watchPriceResult.fairMarketCents), { shouldDirty: true, shouldValidate: true });
        setValue('estimateDate', todayIso(), { shouldDirty: true });
        toast.success('Applied fair market from The Watch API');
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
    const canSaveEarly = index >= 2 && Boolean(values.name?.trim());

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
                <IdentityInputs
                    form={form}
                    category={category}
                    onDecodeVin={decodeVin}
                    decoding={vinLookup.isPending}
                    onLookupWatchReference={category === 'watch' ? lookupWatchReference : undefined}
                    lookingUpWatch={watchSearch.isPending}
                />
                {category === 'watch' && (
                    <WatchLookupCard
                        brand={values.brand ?? ''}
                        model={values.model ?? ''}
                        name={values.name ?? ''}
                        reference={typeof values.details?.referenceNumber === 'string' ? values.details.referenceNumber : ''}
                        searching={watchSearch.isPending}
                        pricing={watchValue.isPending}
                        searchResult={watchSearchResult}
                        priceResult={watchPriceResult}
                        onSearch={lookupWatchReference}
                        onPrice={fetchWatchPrices}
                        onApplyMatch={applyWatchMatch}
                        onApplyPrices={applyWatchPrices}
                        onDismiss={() => {
                            setWatchSearchResult(null);
                            setWatchPriceResult(null);
                        }}
                    />
                )}
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
                    help={
                        nameSuggestion ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                                onClick={() => setValue('name', nameSuggestion, { shouldDirty: true, shouldValidate: true })}
                            >
                                <Sparkles className="size-3" />
                                Use "{nameSuggestion}"
                            </button>
                        ) : (
                            'What you will see in your list, like "Grandpa\'s Omega"'
                        )
                    }
                >
                    <Input id="name" {...register('name')} maxLength={120} autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} />
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
                ? 'Leave anything you don\'t know blank. After saving, you can get a home value estimate from the asset page.'
                : 'Leave anything you don\'t know blank. It shows as "Not entered", never $0.';
        body = (
            <div className="space-y-6">
                {category === 'watch' && (
                    <WatchLookupCard
                        brand={values.brand ?? ''}
                        model={values.model ?? ''}
                        name={values.name ?? ''}
                        reference={typeof values.details?.referenceNumber === 'string' ? values.details.referenceNumber : ''}
                        searching={watchSearch.isPending}
                        pricing={watchValue.isPending}
                        searchResult={watchSearchResult}
                        priceResult={watchPriceResult}
                        onSearch={lookupWatchReference}
                        onPrice={fetchWatchPrices}
                        onApplyMatch={applyWatchMatch}
                        onApplyPrices={applyWatchPrices}
                        onDismiss={() => {
                            setWatchSearchResult(null);
                            setWatchPriceResult(null);
                        }}
                    />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Purchase price" htmlFor="purchasePrice" error={errors.purchasePrice?.message} help="Your cost basis">
                        <MoneyInput id="purchasePrice" {...register('purchasePrice')} aria-invalid={Boolean(errors.purchasePrice) || undefined} />
                    </Field>
                    <Field label="Purchase date" htmlFor="purchaseDate" error={errors.purchaseDate?.message}>
                        <Input id="purchaseDate" type="date" max={todayIso()} {...register('purchaseDate')} aria-invalid={Boolean(errors.purchaseDate) || undefined} />
                    </Field>
                </div>
                {category === 'vehicle' && <VehicleValueLookup query={vehicleQuery} onRecord={applyVehicleEstimate} actionLabel="Use estimate as" />}
                <div className="rounded-xl border p-4">
                    <p className="text-sm font-medium">Current value</p>
                    <p className="text-xs text-muted-foreground">Saved as the first point in its value history.</p>
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

            {/* progress: one segment per question, filling as you go */}
            <div className="mt-6 flex items-center gap-4">
                <div
                    className="grid flex-1 gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
                    role="progressbar"
                    aria-label="Progress"
                    aria-valuemin={1}
                    aria-valuemax={steps.length}
                    aria-valuenow={index + 1}
                >
                    {steps.map((s, i) => (
                        <div key={s} className="h-1 overflow-hidden rounded-full bg-foreground/10">
                            <div className={cn('h-full bg-foreground transition-[width] duration-500 ease-out', i <= index ? 'w-full' : 'w-0')} />
                        </div>
                    ))}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {index + 1} of {steps.length}
                </span>
            </div>

            <div ref={stage} key={stepId} className={cn('py-10 motion-reduce:animate-none sm:py-14', stageClass)}>
                <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">{question}</h1>
                <p className="mt-3 text-muted-foreground">{help}</p>

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
function IdentityInputs({
    form,
    category,
    onDecodeVin,
    decoding,
    onLookupWatchReference,
    lookingUpWatch
}: {
    form: UseFormReturn<AssetFormValues>;
    category: CategoryId;
    onDecodeVin: () => void;
    decoding: boolean;
    onLookupWatchReference?: () => void;
    lookingUpWatch?: boolean;
}) {
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
                    onLookupWatchReference={category === 'watch' ? onLookupWatchReference : undefined}
                    lookingUpWatch={lookingUpWatch}
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
