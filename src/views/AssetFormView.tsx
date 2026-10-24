// add / edit an asset. only name and category are required; everything else can wait.
// errors show next to the field and never clear what you typed, and leaving with unsaved
// changes asks first.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getCategory, type CategoryId } from '@shared/categories.ts';
import { centsToInput } from '@shared/money.ts';
import {
    CONDITION_HINTS,
    CONDITION_LABELS,
    CONDITIONS,
    INSURANCE_HINTS,
    INSURANCE_LABELS,
    INSURANCE_STATUSES,
    OBSERVED_VALUE_TYPES,
    VALUE_TYPE_HINTS,
    VALUE_TYPE_LABELS,
    type InsuranceStatus,
    type LookupSuggestion,
    type ObservedValueType,
    type VinLookupResult
} from '@shared/schemas.ts';
import { ApiError } from '@/api/api.ts';
import { CategoryFields } from '@/components/assets/CategoryFields.tsx';
import { CategoryPicker } from '@/components/assets/CategoryPicker.tsx';
import { Field, MoneyInput, OptionalSelect } from '@/components/assets/FormBits.tsx';
import { SuggestionReview } from '@/components/assets/SuggestionReview.tsx';
import { CompletenessRing } from '@/components/common/CompletenessRing.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { PageHeader } from '@/components/layout/PageHeader.tsx';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { useAssetItem, useCreateAsset, useUpdateAsset, useVinLookup } from '@/hooks/usePortfolio.ts';
import {
    DEFAULT_LOCATIONS,
    assetFormSchema,
    emptyFormValues,
    formFieldForServerKey,
    formValuesFromItem,
    suggestedName,
    toPayload,
    type AssetFormValues
} from '@/lib/assetForm.ts';
import { todayIso } from '@/lib/format.ts';
import { distinctLocations, type PortfolioItem } from '@/lib/portfolio.ts';
import NotFoundView from './NotFoundView.tsx';

const INSURANCE_CHOICES: (InsuranceStatus | '')[] = [...INSURANCE_STATUSES, ''];

export default function AssetFormView({ mode }: { mode: 'create' | 'edit' }) {
    const { id } = useParams();
    const { item, items, isLoading, error, refetch } = useAssetItem(mode === 'edit' ? id : undefined);

    if (isLoading) return <LoadingBlock />;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;
    if (mode === 'edit' && !item) return <NotFoundView what="asset" />;

    // key: a fresh form per asset, so switching between edit pages never mixes values
    return <AssetForm key={item?.asset.id ?? 'new'} item={mode === 'edit' ? item : null} allItems={items ?? []} />;
}

// what the live "record completeness" meter counts while you type (mirrors lib/portfolio.ts)
function liveChecks(v: AssetFormValues) {
    if (!v.category) return { done: 0, total: 6, items: [] as { label: string; done: boolean }[] };
    const def = getCategory(v.category);
    const idFields = def.fields.filter((f) => f.identifier).map((f) => f.key);
    const items = [
        { label: 'Serial or ID', done: v.serialNumber.trim() !== '' || idFields.some((k) => (v.details[k] ?? '').trim() !== '') },
        { label: 'Purchase info', done: v.purchaseDate !== '' || v.purchasePrice.trim() !== '' },
        { label: 'Current value', done: v.estimateAmount.trim() !== '' },
        { label: 'Condition', done: v.condition !== '' },
        ...(v.category === 'property' ? [] : [{ label: 'Location', done: v.location.trim() !== '' }]),
        { label: 'Insurance status', done: v.insurance !== '' }
    ];
    return { done: items.filter((i) => i.done).length, total: items.length, items };
}

function AssetForm({ item, allItems }: { item: PortfolioItem | null; allItems: PortfolioItem[] }) {
    const navigate = useNavigate();
    const editing = item != null;
    const create = useCreateAsset();
    const update = useUpdateAsset(item?.asset.id ?? '');
    const vinLookup = useVinLookup();
    const [vinResult, setVinResult] = useState<VinLookupResult | null>(null);
    const saved = useRef(false);

    const defaults = useMemo(() => (item ? formValuesFromItem(item) : emptyFormValues()), [item]);
    const form = useForm<AssetFormValues>({
        defaultValues: defaults,
        resolver: zodResolver(assetFormSchema),
        mode: 'onTouched'
    });
    const { register, control, handleSubmit, setValue, getValues, setError, formState } = form;
    const { errors, isDirty, dirtyFields, isSubmitting } = formState;
    const values = useWatch({ control }) as AssetFormValues;
    const category = values.category as CategoryId | '';
    const def = category ? getCategory(category) : null;
    const checks = liveChecks(values);
    const nameSuggestion = !values.name?.trim() ? suggestedName(values) : null;

    const locationOptions = useMemo(() => [...new Set([...distinctLocations(allItems), ...DEFAULT_LOCATIONS])], [allItems]);

    // ---------- leaving with unsaved changes ----------
    const blocker = useBlocker(({ currentLocation, nextLocation }) => !saved.current && isDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (!isDirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [isDirty]);

    // ---------- editing: switching the value type pre-fills that type's latest amount ----------
    useEffect(() => {
        if (!item || dirtyFields.estimateAmount) return;
        const latest = item.latest[values.estimateType];
        setValue('estimateAmount', latest?.amountCents != null ? centsToInput(latest.amountCents) : '');
        // only react to the type changing
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values.estimateType]);

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

    const currentFormValue = (field: string): string => {
        const v = getValues(field as Path<AssetFormValues>);
        return typeof v === 'string' ? v : '';
    };

    const applySuggestions = (chosen: LookupSuggestion[]) => {
        // suggestion fields are 'brand', 'model', or 'details.<key>', all plain strings in the form
        const setText = setValue as (name: Path<AssetFormValues>, value: string, opts: { shouldDirty: boolean; shouldValidate: boolean }) => void;
        for (const s of chosen) setText(s.field as Path<AssetFormValues>, String(s.value), { shouldDirty: true, shouldValidate: true });
        setVinResult(null);
        toast.success(`Applied ${chosen.length} field${chosen.length === 1 ? '' : 's'} from NHTSA`);
    };

    // ---------- save ----------
    const onSubmit = async (v: AssetFormValues) => {
        const payload = toPayload(v);
        try {
            const res = editing ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
            saved.current = true;
            toast.success(editing ? 'Changes saved' : `${res.asset.name} added`);
            navigate(`/assets/${res.asset.id}`);
        } catch (err) {
            if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
                for (const [key, message] of Object.entries(err.fieldErrors)) {
                    setError(formFieldForServerKey(key) as Path<AssetFormValues>, { message });
                }
                toast.error('Some fields need attention');
            } else {
                // network or server trouble: keep everything on screen so nothing is lost
                toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined });
            }
        }
    };

    const onInvalid = () => toast.error('Some fields need attention', { description: 'Check the highlighted fields.' });
    const busy = isSubmitting || create.isPending || update.isPending;
    const cancelTo = editing ? `/assets/${item.asset.id}` : '/assets';

    return (
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6 pb-24 lg:pb-6">
            <PageHeader
                eyebrow={
                    <Link to={cancelTo} className="inline-flex items-center gap-1 hover:text-foreground">
                        <ArrowLeft className="size-3.5" />
                        {editing ? item.asset.name : 'Assets'}
                    </Link>
                }
                title={editing ? 'Edit asset' : 'Add an asset'}
                description="Only the name and category are required. Fill in the rest whenever you have it."
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="space-y-6">
                    {/* ---------- basics ---------- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>What is it?</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <Field label="Category" optional={false} error={errors.category?.message}>
                                <Controller
                                    control={control}
                                    name="category"
                                    render={({ field }) => <CategoryPicker value={field.value} onChange={(id) => field.onChange(id)} invalid={Boolean(errors.category)} />}
                                />
                            </Field>

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
                                        'What you call it, like "Grandpa\'s Omega" or "2020 Cadillac XT6"'
                                    )
                                }
                            >
                                <Input id="name" {...register('name')} maxLength={120} autoComplete="off" aria-invalid={Boolean(errors.name) || undefined} />
                            </Field>

                            {def?.brandLabel && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label={def.brandLabel} htmlFor="brand" error={errors.brand?.message}>
                                        <Input id="brand" {...register('brand')} maxLength={80} autoComplete="off" />
                                    </Field>
                                    <Field label={def.modelLabel ?? 'Model'} htmlFor="model" error={errors.model?.message}>
                                        <Input id="model" {...register('model')} maxLength={120} autoComplete="off" />
                                    </Field>
                                </div>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Condition" error={errors.condition?.message} help={values.condition ? CONDITION_HINTS[values.condition] : 'Condition drives resale value'}>
                                    <Controller
                                        control={control}
                                        name="condition"
                                        render={({ field }) => (
                                            <div role="radiogroup" aria-label="Condition" className="flex flex-wrap gap-1">
                                                {CONDITIONS.map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={field.value === c}
                                                        // click the active one again to clear it
                                                        onClick={() => field.onChange(field.value === c ? '' : c)}
                                                        className={
                                                            field.value === c
                                                                ? 'rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground'
                                                                : 'rounded-md border px-2.5 py-1 text-sm hover:bg-muted'
                                                        }
                                                    >
                                                        {CONDITION_LABELS[c]}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                </Field>
                                {category !== 'property' && (
                                    <Field label="Location" htmlFor="location" error={errors.location?.message} help="Where it's kept">
                                        <Input id="location" list="location-options" {...register('location')} maxLength={80} autoComplete="off" placeholder="Home office" />
                                        <datalist id="location-options">
                                            {locationOptions.map((l) => (
                                                <option key={l} value={l} />
                                            ))}
                                        </datalist>
                                    </Field>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* ---------- category details (progressive) ---------- */}
                    {def && def.fields.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{def.singular} details</CardTitle>
                                <CardDescription>All optional.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <CategoryFields form={form} category={category as CategoryId} onDecodeVin={category === 'vehicle' ? decodeVin : undefined} decoding={vinLookup.isPending} />
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
                            </CardContent>
                        </Card>
                    )}

                    {/* ---------- money ---------- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Purchase and value</CardTitle>
                            <CardDescription>Leave anything you don't know blank. Blank shows as "Not entered", never $0.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Purchase date" htmlFor="purchaseDate" error={errors.purchaseDate?.message}>
                                    <Input id="purchaseDate" type="date" max={todayIso()} {...register('purchaseDate')} aria-invalid={Boolean(errors.purchaseDate) || undefined} />
                                </Field>
                                <Field label="Purchase price" htmlFor="purchasePrice" error={errors.purchasePrice?.message} help="Your cost basis">
                                    <MoneyInput id="purchasePrice" {...register('purchasePrice')} aria-invalid={Boolean(errors.purchasePrice) || undefined} />
                                </Field>
                            </div>

                            <div className="rounded-lg border p-4">
                                <div className="mb-3">
                                    <p className="text-sm font-medium">{editing ? 'Update a current value' : 'Current value'}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {editing
                                            ? 'Changing the amount records a new dated value. The old one stays in the history.'
                                            : 'Saved as the first point in this asset\'s value history.'}
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                                    <Field label="Value type" htmlFor="estimateType" help={VALUE_TYPE_HINTS[values.estimateType]} className="sm:col-span-2 xl:col-span-1">
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
                        </CardContent>
                    </Card>

                    {/* ---------- identification + coverage ---------- */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Proof and coverage</CardTitle>
                            <CardDescription>What an insurer would ask for after a loss.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <Field
                                label="Serial number or other ID"
                                htmlFor="serialNumber"
                                error={errors.serialNumber?.message}
                                help={def?.fields.some((f) => f.identifier) ? `Or use the ${def.fields.find((f) => f.identifier)!.label} field above` : undefined}
                            >
                                <Input id="serialNumber" {...register('serialNumber')} maxLength={80} autoComplete="off" spellCheck={false} className="font-mono" />
                            </Field>

                            <Field label="Insurance" error={errors.insurance?.message}>
                                <Controller
                                    control={control}
                                    name="insurance"
                                    render={({ field }) => (
                                        <div role="radiogroup" aria-label="Insurance" className="grid gap-2 sm:grid-cols-2">
                                            {INSURANCE_CHOICES.map((s) => {
                                                const active = field.value === s;
                                                return (
                                                    <button
                                                        key={s || 'unknown'}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        onClick={() => field.onChange(s)}
                                                        className={`flex items-start gap-2 rounded-lg border p-2.5 text-left ${active ? 'border-foreground/60 bg-muted ring-1 ring-foreground/30' : 'hover:bg-muted/60'}`}
                                                    >
                                                        <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-primary bg-primary text-primary-foreground' : ''}`}>
                                                            {active && <Check className="size-3" />}
                                                        </span>
                                                        <span>
                                                            <span className="block text-sm font-medium">{s ? INSURANCE_LABELS[s] : 'Not sure yet'}</span>
                                                            <span className="block text-xs text-muted-foreground">{s ? INSURANCE_HINTS[s] : 'Shows as not entered'}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                />
                            </Field>

                            {(values.insurance === 'insured' || values.insurance === 'scheduled') && (
                                <Field label="Policy note" htmlFor="insuranceNote" help='Like "Homeowners HO-3" or "Jewelry rider"'>
                                    <Input id="insuranceNote" {...register('insuranceNote')} maxLength={160} autoComplete="off" />
                                </Field>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea id="notes" {...register('notes')} rows={4} maxLength={4000} placeholder="Anything worth remembering: where you bought it, repairs, stories" />
                            {errors.notes?.message && <p className="mt-1 text-xs font-medium text-destructive">{errors.notes.message}</p>}
                        </CardContent>
                    </Card>
                </div>

                {/* ---------- sticky sidebar: completeness + save ---------- */}
                <aside className="hidden lg:block">
                    <div className="sticky top-8 space-y-4">
                        <Card size="sm">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CompletenessRing done={checks.done} total={checks.total} size={26} showLabel={false} />
                                    Record {checks.done} of {checks.total}
                                </CardTitle>
                                <CardDescription>Complete records are easier to insure and claim.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {checks.items.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Pick a category to start.</p>
                                ) : (
                                    <ul className="space-y-1.5 text-sm">
                                        {checks.items.map((c) => (
                                            <li key={c.label} className="flex items-center gap-2">
                                                <span className={`flex size-4 items-center justify-center rounded-full ${c.done ? 'bg-good text-white' : 'border border-muted-foreground/40'}`}>
                                                    {c.done && <Check className="size-3" />}
                                                </span>
                                                <span className={c.done ? '' : 'text-muted-foreground'}>{c.label}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                        <div className="flex flex-col gap-2">
                            <Button type="submit" size="lg" disabled={busy}>
                                {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                                {editing ? 'Save changes' : 'Save asset'}
                            </Button>
                            <Button asChild variant="ghost">
                                <Link to={cancelTo}>Cancel</Link>
                            </Button>
                        </div>
                    </div>
                </aside>
            </div>

            {/* phone save bar */}
            <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
                <CompletenessRing done={checks.done} total={checks.total} />
                <div className="ml-auto flex gap-2">
                    <Button asChild variant="ghost">
                        <Link to={cancelTo}>Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={busy}>
                        {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
                        Save
                    </Button>
                </div>
            </div>

            <AlertDialog open={blocker.state === 'blocked'}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
                        <AlertDialogDescription>Your changes to this asset haven't been saved yet.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
                            Discard changes
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}
