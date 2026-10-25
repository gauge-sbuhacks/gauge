// review what the phone's photo was identified as, one question at a time, then save it as an asset.
// the money boxes hold what you type ("150"), and are turned into cents only when saving.

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES, getCategory, isCategoryId, type CategoryId, type Details } from '@shared/categories.ts';
import { reviewSteps, type CaptureApproval, type CaptureDraft, type ReviewStep } from '@shared/capture.ts';
import { centsToInput, parseMoneyInput } from '@shared/money.ts';
import { CONDITION_LABELS, CONDITIONS, PRICE_CHECK_SOURCE, type Condition, type SuggestValuesQuery } from '@shared/schemas.ts';
import { AuthImage } from '@/components/assets/AuthImage.tsx';
import { MoneyInput } from '@/components/assets/FormBits.tsx';
import { ValueOriginTag } from '@/components/common/ValueOriginTag.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { useCaptureDesk } from '@/hooks/useCaptureSession.ts';
import { useSuggestValues } from '@/hooks/usePortfolio.ts';
import { formatMoney } from '@/lib/format.ts';
import { cn } from '@/lib/utils.ts';
import type { ValueOrigin } from '@/lib/valueOrigin.ts';

export default function CreateAssetView() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const desk = useCaptureDesk(undefined, true, sessionId ?? null);
    const ready = desk.session.data?.drafts.find((draft) => draft.status === 'ready');

    if (desk.session.isError) return <p className="text-sm text-destructive">{desk.session.error.message}</p>;

    if (!ready) {
        return (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Process will proceed once image is uploaded.
            </p>
        );
    }

    return (
        <DraftReview
            key={ready.id}
            draft={ready}
            busy={desk.confirm.isPending}
            onCancel={() => {
                desk.discard.mutate(ready.id, {
                    onSuccess: () => navigate('/assets'),
                    onError: (err) => toast.error(err.message)
                });
            }}
            onSave={(approval) =>
                desk.confirm.mutate(
                    { draftId: ready.id, approval },
                    {
                        onSuccess: (data) => {
                            const more = data.session.drafts.some((draft) => draft.status === 'ready' || draft.status === 'identifying');
                            toast.success(more ? 'Saved. Another item is ready to review.' : 'Asset saved');
                            if (!more) navigate(`/assets/${data.assetId}`);
                        },
                        onError: (err) => toast.error(err.message)
                    }
                )
            }
        />
    );
}

const MONEY_KINDS = new Set<ReviewStep['kind']>(['purchase', 'value', 'quickSale']);
const isMoney = (step: ReviewStep) => MONEY_KINDS.has(step.kind);

// money steps arrive as cents ("15000"); the boxes hold what you type ("150"), like the add form
function startingAnswer(step: ReviewStep): string {
    if (!isMoney(step) || step.value === '') return step.value;
    const cents = Number(step.value);
    return Number.isFinite(cents) ? centsToInput(cents) : '';
}

function startingAnswers(steps: ReviewStep[]): Record<string, string> {
    return Object.fromEntries(steps.map((step) => [step.key, startingAnswer(step)]));
}

// a price filled in automatically, and where it came from
type AutoValue = { amountCents: number; sourceName: string; notes: string } | null;
type AutoValues = { value: AutoValue; quickSale: AutoValue };

function autoFrom(v: CaptureDraft['suggestedValue']): AutoValue {
    return v && v.amountCents > 0 ? { amountCents: v.amountCents, sourceName: v.sourceName, notes: v.notes } : null;
}

// what the price check is asked about. when any of it changes (category, name, brand, model,
// condition, details), the old price may not fit, so it runs again
function priceQueryFor(approval: CaptureApproval): SuggestValuesQuery | null {
    if (approval.category === 'property' || !approval.name) return null;
    return {
        category: approval.category,
        name: approval.name,
        brand: approval.brand ?? null,
        model: approval.model ?? null,
        condition: approval.condition ?? null,
        details: approval.details ?? {}
    };
}

function DraftReview({ draft, busy, onSave, onCancel }: { draft: CaptureDraft; busy: boolean; onSave: (approval: CaptureApproval) => void; onCancel: () => void }) {
    const [answers, setAnswers] = useState<Record<string, string>>(() => startingAnswers(reviewSteps(draft)));
    // picking a different category asks that category's questions (brand, model, ...)
    const pickedCategory = isCategoryId(answers.category ?? '') ? (answers.category as CategoryId) : draft.category;
    const steps = useMemo(() => reviewSteps({ ...draft, category: pickedCategory }), [draft, pickedCategory]);
    const allAnswers = () => ({ ...startingAnswers(steps), ...answers });
    const answerFor = (step: ReviewStep) => answers[step.key] ?? startingAnswer(step);
    const [index, setIndex] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const [dir, setDir] = useState<1 | -1>(1);
    const [error, setError] = useState<string | null>(null);
    const step = steps[Math.min(index, steps.length - 1)];
    const stageClass = leaving
        ? cn('animate-out fade-out duration-200 ease-in fill-mode-forwards', dir === 1 ? 'slide-out-to-top-4' : 'slide-out-to-bottom-4')
        : cn('animate-in fade-in duration-500 ease-out fill-mode-both', dir === 1 ? 'slide-in-from-bottom-6' : 'slide-in-from-top-6');

    // ---------- the price check ----------
    // the photo's identification usually priced the item already. if it couldn't, or you corrected what
    // the item is, the AI price check runs again (as on the add form) once you reach the money questions
    const suggest = useSuggestValues();
    const [auto, setAuto] = useState<AutoValues>(() => ({ value: autoFrom(draft.suggestedValue), quickSale: autoFrom(draft.quickSale) }));
    const [priceNote, setPriceNote] = useState<string | null>(null);
    const latest = useRef({ answers, auto });
    latest.current = { answers, auto };
    // what the photo was already priced as. with both values and nothing changed, there's nothing to redo
    const pricedFor = useRef<string | null>(null);
    if (pricedFor.current === null) {
        const first = reviewSteps(draft);
        const query = priceQueryFor(approvalFrom(first, startingAnswers(first), auto));
        pricedFor.current = draft.suggestedValue && draft.quickSale && query ? JSON.stringify(query) : '';
    }

    useEffect(() => {
        if (leaving || !isMoney(step)) return;
        const query = priceQueryFor(approvalFrom(steps, allAnswers(), auto));
        if (!query) return;
        const sig = JSON.stringify(query);
        if (sig === pricedFor.current) return;
        pricedFor.current = sig;
        setPriceNote(null);
        suggest.mutate(query, {
            onSuccess: (result) => {
                const { answers: now, auto: before } = latest.current;
                const next = { ...before };
                const fills: Record<string, string> = {};
                for (const [key, part] of [
                    ['value', result.fairMarket],
                    ['quickSale', result.quickSale]
                ] as const) {
                    if (!part) continue;
                    const typed = parseMoneyInput(now[key] ?? '');
                    // fill an empty box, or replace the old automatic price. never overwrite a number you typed
                    if (typed == null || typed === before[key]?.amountCents) {
                        fills[key] = centsToInput(part.amountCents);
                        next[key] = part;
                    }
                }
                setAuto(next);
                if (Object.keys(fills).length) setAnswers((prev) => ({ ...prev, ...fills }));
                if (!result.fairMarket && !result.quickSale) setPriceNote(result.lookupMessage ?? 'No automatic price for this one. Type your own.');
            },
            onError: (err) => setPriceNote(`Couldn't get an automatic price (${err.message}). Type your own.`)
        });
        // runs when you reach a money question, or the item's questions change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step.kind, leaving, steps]);

    const go = (next: number) => {
        if (leaving || next === index || next < 0 || next >= steps.length) return;
        setDir(next > index ? 1 : -1);
        setLeaving(true);
        window.setTimeout(() => {
            setIndex(next);
            setLeaving(false);
            setError(null);
        }, 200);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const value = answerFor(step);
        if (step.kind === 'name' && !value.trim()) return setError('Add a name.');
        if (step.kind === 'category' && !isCategoryId(value)) return setError('Pick a category.');
        if (step.kind === 'purchase' && !paidOk(value)) return setError('Enter what you paid, like 150 or 1,250.00. Use 0 if it was a gift.');
        if ((step.kind === 'value' || step.kind === 'quickSale') && !priceOk(value)) {
            return setError(suggest.isPending ? 'Still looking up a price. One moment.' : `Enter a ${step.label.toLowerCase()}, like 150 or 1,250.00.`);
        }
        if (index < steps.length - 1) return go(index + 1);
        onSave(approvalFrom(steps, allAnswers(), auto));
    };

    const valueStep = step.kind === 'value' || step.kind === 'quickSale';
    const origin = step.kind === 'value' || step.kind === 'quickSale' ? originFor(answerFor(step), auto[step.kind]) : null;

    return (
        <div>
            <div className="mb-8 flex items-center gap-4">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
                    <div className="h-full bg-foreground transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {index + 1} of {steps.length}
                </span>
                <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                </button>
            </div>
            <div key={index} className={cn('max-w-xl motion-reduce:animate-none', stageClass)}>
                <form onSubmit={submit} noValidate>
                    {draft.photos[0] && <AuthImage photoId={draft.photos[0].photoId} alt="" className="mb-6 size-24 rounded-lg object-cover" />}
                    <label htmlFor={step.key} className="block text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                        {answerFor(step) ? `Is the ${step.label.toLowerCase()} right?` : `What is the ${step.label.toLowerCase()}?`}
                    </label>
                    <p className="mt-3 text-muted-foreground">Change it if it is wrong, then continue.</p>
                    <div className="mt-8">
                        <StepField
                            step={step}
                            category={pickedCategory ?? ''}
                            value={answerFor(step)}
                            onChange={(value) => {
                                setAnswers((prev) => ({ ...prev, [step.key]: value }));
                                setError(null);
                            }}
                        />
                    </div>
                    {valueStep && suggest.isPending && (
                        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" />
                            Running an AI price check on the details you confirmed…
                        </p>
                    )}
                    {origin && !suggest.isPending && (
                        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
                            <ValueOriginTag origin={origin.origin} label={origin.label} />
                            <span>{origin.note}</span>
                        </p>
                    )}
                    {valueStep && priceNote && !origin && !suggest.isPending && <p className="mt-3 text-sm text-muted-foreground">{priceNote}</p>}
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                    <div className="mt-8 flex items-center gap-2">
                        <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
                            {index === steps.length - 1 ? (busy ? 'Saving' : 'Add asset') : 'Continue'}
                            {busy ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
                        </Button>
                        {index > 0 && (
                            <Button type="button" variant="ghost" size="lg" className="h-10 px-3" onClick={() => go(index - 1)} disabled={busy}>
                                <ArrowLeft data-icon="inline-start" />
                                Back
                            </Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

// the chip under a value: still the automatic price, or a number you typed
function originFor(raw: string, auto: AutoValue): { origin: ValueOrigin; label?: string; note: string } | null {
    const cents = parseMoneyInput(raw);
    if (cents == null) return null;
    if (auto && auto.amountCents === cents) {
        const ai = auto.sourceName === PRICE_CHECK_SOURCE;
        return {
            origin: ai ? 'ai' : 'market',
            label: ai ? undefined : auto.sourceName,
            note: ai ? 'A ballpark from an AI price check, not a quote. Change it if you know better.' : `From ${auto.sourceName}. Change it if you know better.`
        };
    }
    return { origin: 'manual', note: 'Your own number. It is saved as a manual entry.' };
}

function StepField({ step, category, value, onChange }: { step: ReviewStep; category: string; value: string; onChange: (value: string) => void }) {
    if (step.kind === 'category') {
        return (
            <Select value={value || undefined} onValueChange={onChange}>
                <SelectTrigger id={step.key} className="h-12! w-full px-3.5 text-base">
                    <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                    {CATEGORIES.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                            {category.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    if (step.kind === 'condition') {
        return (
            <Select value={value || undefined} onValueChange={onChange}>
                <SelectTrigger id={step.key} className="h-12! w-full px-3.5 text-base">
                    <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                    {CONDITIONS.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                            {CONDITION_LABELS[condition]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    if (isMoney(step)) {
        // the box keeps exactly what you type, so the cursor never jumps and "150" stays "150"
        const cents = parseMoneyInput(value);
        return (
            <div className="space-y-2">
                <MoneyInput id={step.key} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 pl-7 text-lg" />
                {cents != null && cents > 0 && <p className="text-sm text-muted-foreground">{formatMoney(cents, { exact: cents % 100 !== 0 })}</p>}
            </div>
        );
    }
    if (step.kind === 'detail' && step.detailKey) {
        const field = getCategory(isCategoryId(category) ? category : 'other').fields.find((item) => item.key === step.detailKey);
        const options =
            field?.type === 'boolean'
                ? [
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' }
                  ]
                : field?.type === 'select'
                  ? field.options
                  : null;
        if (options) {
            return (
                <Select value={value || undefined} onValueChange={onChange}>
                    <SelectTrigger id={step.key} className="h-12! w-full px-3.5 text-base">
                        <SelectValue placeholder="Not entered" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }
        if (field?.type === 'number' || field?.type === 'integer') {
            return (
                <Input
                    id={step.key}
                    inputMode={field.type === 'integer' ? 'numeric' : 'decimal'}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className="h-12 px-3.5 text-lg tabular-nums"
                />
            );
        }
    }
    return <Input id={step.key} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 px-3.5 text-lg" />;
}

function approvalFrom(steps: ReviewStep[], answers: Record<string, string>, auto: AutoValues): CaptureApproval {
    const category = isCategoryId(answers.category ?? '') ? (answers.category as CategoryId) : 'other';
    const details: Details = {};
    for (const step of steps) {
        if (step.kind !== 'detail' || !step.detailKey) continue;
        const raw = answers[step.key]?.trim();
        if (!raw) continue;
        const field = getCategory(category).fields.find((item) => item.key === step.detailKey);
        if (field?.type === 'integer' || field?.type === 'number') {
            const n = Number(raw.replace(/,/g, ''));
            if (Number.isFinite(n)) details[step.detailKey] = field.type === 'integer' ? Math.round(n) : n;
        } else if (field?.type === 'boolean') details[step.detailKey] = raw === 'true';
        else details[step.detailKey] = raw;
    }
    const value = parseMoneyInput(answers.value ?? '') ?? null;
    const quickSale = parseMoneyInput(answers.quickSale ?? '') ?? null;
    // a value keeps its source only while it's still the automatic amount; otherwise it's a manual entry
    const sourceOf = (cents: number | null, a: AutoValue) => (a && cents === a.amountCents ? { sourceName: a.sourceName, notes: a.notes } : null);
    const approval: CaptureApproval = {
        category,
        name: answers.name?.trim() ?? '',
        details,
        purchasePriceCents: parseMoneyInput(answers.purchase ?? '') ?? null,
        valueCents: value,
        quickSaleCents: quickSale,
        valueSource: sourceOf(value, auto.value),
        quickSaleSource: sourceOf(quickSale, auto.quickSale)
    };
    if (steps.some((step) => step.kind === 'brand')) approval.brand = answers.brand?.trim() || null;
    if (steps.some((step) => step.kind === 'model')) approval.model = answers.model?.trim() || null;
    if (steps.some((step) => step.kind === 'serialNumber')) approval.serialNumber = answers.serialNumber?.trim() || null;
    if (steps.some((step) => step.kind === 'condition')) {
        approval.condition = (CONDITIONS as readonly string[]).includes(answers.condition ?? '') ? (answers.condition as Condition) : null;
    }
    return approval;
}

function paidOk(value: string | undefined): boolean {
    const cents = parseMoneyInput(value ?? '');
    return cents != null && cents >= 0;
}

function priceOk(value: string | undefined): boolean {
    const cents = parseMoneyInput(value ?? '');
    return cents != null && cents > 0;
}
