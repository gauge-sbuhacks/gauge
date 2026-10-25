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

// the only money question is what you paid. Gemini's price fills fair market and quick-sale
const isMoney = (step: ReviewStep) => step.kind === 'purchase';

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
    // the item is, the AI price check runs again (as on the add form) when you reach the last question
    const suggest = useSuggestValues();
    const [auto, setAuto] = useState<AutoValues>(() => ({ value: autoFrom(draft.suggestedValue), quickSale: autoFrom(draft.quickSale) }));
    const [priceNote, setPriceNote] = useState<string | null>(null);
    const latest = useRef({ auto });
    latest.current = { auto };
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
                // the newest price wins, since it was priced from the details you just confirmed
                const before = latest.current.auto;
                setAuto({ value: result.fairMarket ?? before.value, quickSale: result.quickSale ?? before.quickSale });
                if (!result.fairMarket && !result.quickSale) setPriceNote(result.lookupMessage ?? 'No automatic price for this one yet.');
            },
            onError: (err) => setPriceNote(`Couldn't get an automatic price (${err.message}).`)
        });
        // runs when you reach the last question, or the item's questions change
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
        if (step.kind === 'purchase' && value.trim() && !paidOk(value)) return setError('Enter what you paid, like 150 or 1,250.00, or leave it blank.');
        if (index < steps.length - 1) return go(index + 1);
        onSave(approvalFrom(steps, allAnswers(), auto));
    };

    const isLast = index === steps.length - 1;
    // saving waits for a price check that's still running, so the item is saved with its value
    const pricing = isLast && suggest.isPending;

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
                    <p className="mt-3 text-muted-foreground">
                        {step.kind === 'purchase' ? 'Your cost basis, so you can see a gain or loss. Leave it blank if you are not sure.' : 'Change it if it is wrong, then continue.'}
                    </p>
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
                    {isLast && <PriceSummary auto={auto} pending={suggest.isPending} note={priceNote} />}
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                    <div className="mt-8 flex items-center gap-2">
                        <Button type="submit" size="lg" className="h-10 px-4" disabled={busy || pricing}>
                            {isLast ? (busy ? 'Saving' : pricing ? 'Pricing' : 'Add asset') : 'Continue'}
                            {busy || pricing ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
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

// Gemini's price (or a provider's, like VinAudit), shown on the last step and saved with the asset
function PriceSummary({ auto, pending, note }: { auto: AutoValues; pending: boolean; note: string | null }) {
    if (pending) {
        return (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Pricing it from the details you confirmed…
            </p>
        );
    }
    const main = auto.value ?? auto.quickSale;
    if (!main) {
        return (
            <p className="mt-6 rounded-xl border p-4 text-sm text-muted-foreground">
                {note ?? 'No automatic price for this one yet.'} It saves as "Not entered". You can record a value later from the asset page.
            </p>
        );
    }
    const ai = main.sourceName === PRICE_CHECK_SOURCE;
    const origin: ValueOrigin = ai ? 'ai' : 'market';
    return (
        <div className="mt-6 rounded-xl border p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">What it's worth</p>
                <ValueOriginTag origin={origin} label={ai ? undefined : main.sourceName} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-4">
                <div>
                    <dt className="text-xs text-muted-foreground">Fair market value</dt>
                    <dd className="text-xl font-semibold tabular-nums">{auto.value ? formatMoney(auto.value.amountCents) : 'Not entered'}</dd>
                </div>
                <div>
                    <dt className="text-xs text-muted-foreground">Quick-sale value</dt>
                    <dd className="text-xl font-semibold tabular-nums">{auto.quickSale ? formatMoney(auto.quickSale.amountCents) : 'Not entered'}</dd>
                </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
                {ai ? 'A ballpark from an AI price check, not a quote. ' : ''}Saved with the asset. You can record a different value later from the asset page.
            </p>
        </div>
    );
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
                <MoneyInput id={step.key} value={value} placeholder="Leave blank if unsure" onChange={(event) => onChange(event.target.value)} className="h-12 pl-7 text-lg" />
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
    const approval: CaptureApproval = {
        category,
        name: answers.name?.trim() ?? '',
        details,
        // blank means "not entered": no photo can tell what you paid
        purchasePriceCents: parseMoneyInput(answers.purchase ?? '') ?? null
    };
    // the values are the automatic price, sent with its source so it's labeled that way
    if (auto.value) {
        approval.valueCents = auto.value.amountCents;
        approval.valueSource = { sourceName: auto.value.sourceName, notes: auto.value.notes };
    }
    if (auto.quickSale) {
        approval.quickSaleCents = auto.quickSale.amountCents;
        approval.quickSaleSource = { sourceName: auto.quickSale.sourceName, notes: auto.quickSale.notes };
    }
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
