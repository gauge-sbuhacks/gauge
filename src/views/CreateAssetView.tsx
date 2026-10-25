import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES, getCategory, isCategoryId, type CategoryId, type Details } from '@shared/categories.ts';
import { reviewSteps, type CaptureApproval, type CaptureDraft, type ReviewStep } from '@shared/capture.ts';
import { CONDITION_LABELS, CONDITIONS, type Condition } from '@shared/schemas.ts';
import { AuthImage } from '@/components/assets/AuthImage.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { useCaptureDesk } from '@/hooks/useCaptureSession.ts';
import { formatMoney } from '@/lib/format.ts';
import { cn } from '@/lib/utils.ts';

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

function DraftReview({ draft, busy, onSave, onCancel }: { draft: CaptureDraft; busy: boolean; onSave: (approval: CaptureApproval) => void; onCancel: () => void }) {
    const steps = reviewSteps(draft);
    const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(steps.map((step) => [step.key, step.value])));
    const [index, setIndex] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const [dir, setDir] = useState<1 | -1>(1);
    const [error, setError] = useState<string | null>(null);
    const step = steps[index];
    const stageClass = leaving
        ? cn('animate-out fade-out duration-200 ease-in fill-mode-forwards', dir === 1 ? 'slide-out-to-top-4' : 'slide-out-to-bottom-4')
        : cn('animate-in fade-in duration-500 ease-out fill-mode-both', dir === 1 ? 'slide-in-from-bottom-6' : 'slide-in-from-top-6');

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
        if (step.kind === 'name' && !answers.name?.trim()) return setError('Add a name.');
        if (step.kind === 'category' && !isCategoryId(answers.category ?? '')) return setError('Pick a category.');
        if (step.kind === 'purchase' && !paidOk(answers.purchase)) return setError('Enter what you paid. Use 0 if it was a gift.');
        if ((step.kind === 'value' || step.kind === 'quickSale') && !priceOk(answers[step.key])) return setError(`Enter a ${step.label.toLowerCase()}.`);
        if (index < steps.length - 1) return go(index + 1);
        onSave(approvalFrom(steps, answers));
    };

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
                        {step.value ? `Is the ${step.label.toLowerCase()} right?` : `What is the ${step.label.toLowerCase()}?`}
                    </label>
                    <p className="mt-3 text-muted-foreground">Change it if it is wrong, then continue.</p>
                    <div className="mt-8">
                        <StepField step={step} category={answers.category ?? ''} value={answers[step.key] ?? ''} onChange={(value) => { setAnswers((prev) => ({ ...prev, [step.key]: value })); setError(null); }} />
                    </div>
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
    if (step.kind === 'value' || step.kind === 'quickSale' || step.kind === 'purchase') {
        const cents = Number(value);
        return (
            <div className="space-y-2">
                <Input
                    id={step.key}
                    inputMode="decimal"
                    value={value === '' ? '' : Number.isFinite(cents) ? (cents / 100).toFixed(2) : ''}
                    onChange={(event) => {
                        const raw = event.target.value.trim();
                        if (raw === '') onChange('');
                        else if (Number.isFinite(Number(raw))) onChange(String(Math.round(Number(raw) * 100)));
                    }}
                    className="h-12 px-3.5 text-lg"
                />
                {Number.isFinite(cents) && cents > 0 && <p className="text-sm text-muted-foreground">{formatMoney(cents)}</p>}
            </div>
        );
    }
    if (step.kind === 'detail' && step.detailKey) {
        const field = getCategory(isCategoryId(category) ? category : 'other').fields.find((item) => item.key === step.detailKey);
        if (field?.type === 'select' && field.options) {
            return (
                <Select value={value} onValueChange={onChange}>
                    <SelectTrigger id={step.key} className="h-12! w-full px-3.5 text-base">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            );
        }
    }
    return <Input id={step.key} value={value} onChange={(event) => onChange(event.target.value)} className="h-12 px-3.5 text-lg" />;
}

function approvalFrom(steps: ReviewStep[], answers: Record<string, string>): CaptureApproval {
    const category = isCategoryId(answers.category ?? '') ? (answers.category as CategoryId) : 'other';
    const details: Details = {};
    for (const step of steps) {
        if (step.kind !== 'detail' || !step.detailKey) continue;
        const raw = answers[step.key]?.trim();
        if (!raw) continue;
        const field = getCategory(category).fields.find((item) => item.key === step.detailKey);
        if (field?.type === 'integer' || field?.type === 'number') {
            const n = Number(raw);
            if (Number.isFinite(n)) details[step.detailKey] = field.type === 'integer' ? Math.round(n) : n;
        } else if (field?.type === 'boolean') details[step.detailKey] = raw === 'true';
        else details[step.detailKey] = raw;
    }
    const approval: CaptureApproval = {
        category,
        name: answers.name?.trim() ?? '',
        details,
        purchasePriceCents: Math.round(Number(answers.purchase)),
        valueCents: Math.round(Number(answers.value)),
        quickSaleCents: Math.round(Number(answers.quickSale))
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
    if (value == null || value.trim() === '') return false;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0;
}

function priceOk(value: string | undefined): boolean {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
}
