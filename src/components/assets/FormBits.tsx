// small form helpers: a labeled field wrapper, a $ money input, and a select that allows "not entered"

import type { ComponentProps, ReactNode } from 'react';
import { Asterisk, Cog, Gauge, NotebookPen } from 'lucide-react';
import type { FieldRole } from '@shared/categories.ts';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { cn } from '@/lib/utils.ts';

// what a box is for: required, priced from ("helps the estimate"), or kept for your records
export type FieldTag = 'required' | FieldRole;

const TAGS: Record<FieldTag, { label: string; short: string; icon: typeof Gauge; className: string }> = {
    required: { label: 'Required', short: 'Required', icon: Asterisk, className: 'border-loss/40 text-loss' },
    value: { label: 'Helps the estimate', short: 'Helps estimate', icon: Gauge, className: 'border-brass/40 bg-brass-soft text-brass' },
    record: { label: 'For your records', short: 'For your records', icon: NotebookPen, className: 'border-border text-muted-foreground' }
};

export function FieldTagChip({ tag, long = false, className }: { tag: FieldTag; long?: boolean; className?: string }) {
    const t = TAGS[tag];
    const Icon = t.icon;
    return (
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap', t.className, className)}>
            <Icon className="size-3" aria-hidden />
            {long ? t.label : t.short}
        </span>
    );
}

// the key to the chips, shown once at the top of the add flow
export function FieldTagLegend({ className }: { className?: string }) {
    return (
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground', className)}>
            <span className="inline-flex items-center gap-1.5">
                <FieldTagChip tag="required" /> only the name
            </span>
            <span className="inline-flex items-center gap-1.5">
                <FieldTagChip tag="value" long /> the value is based on these
            </span>
            <span className="inline-flex items-center gap-1.5">
                <FieldTagChip tag="record" long /> just for you: insurance, selling, notes
            </span>
        </div>
    );
}

export function Field({
    label,
    htmlFor,
    error,
    help,
    optional,
    tag,
    className,
    children
}: {
    label: ReactNode;
    htmlFor?: string;
    error?: string;
    help?: ReactNode;
    optional?: boolean;
    // a chip beside the label saying what the box is for
    tag?: FieldTag;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <div className="flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor={htmlFor} className="text-sm">
                    {label}
                    {optional === false && tag !== 'required' && <span className="text-loss">*</span>}
                </Label>
                {tag && <FieldTagChip tag={tag} />}
            </div>
            {children}
            {error ? (
                <p className="text-xs font-medium text-destructive" role="alert">
                    {error}
                </p>
            ) : (
                help && <p className="text-xs text-muted-foreground">{help}</p>
            )}
        </div>
    );
}

export function MoneyInput({ className, ...props }: ComponentProps<'input'>) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input inputMode="decimal" autoComplete="off" placeholder="0" className={cn('pl-6 tabular-nums', className)} {...props} />
        </div>
    );
}

export function UnitInput({ unit, className, ...props }: ComponentProps<'input'> & { unit?: string }) {
    if (!unit) return <Input className={className} {...props} />;
    return (
        <div className="relative">
            <Input className={cn('pr-14', className)} {...props} />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
        </div>
    );
}

// radix select can't hold an empty value, so "not entered" travels as a sentinel
const NONE = '__none__';

export function OptionalSelect({
    id,
    value,
    onChange,
    options,
    placeholder = 'Not entered',
    invalid,
    allowNone = true
}: {
    id?: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    invalid?: boolean;
    allowNone?: boolean;
}) {
    const known = options.some((o) => o.value === value);
    return (
        <Select value={known ? value : NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
            <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {allowNone && (
                    <SelectItem value={NONE}>
                        <span className="text-muted-foreground">{placeholder}</span>
                    </SelectItem>
                )}
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

// one click to use a suggested name ("2020 Cadillac XT6", "Seiko 5 Sports"). it sits under the name
// box rather than in the help line, so it stays put when "Give it a name" shows. pressing it doesn't
// take focus from the box either: leaving the empty box would mark it missing mid-click and the
// click would land on nothing
export function NameSuggestion({ name, onUse }: { name: string; onUse: () => void }) {
    return (
        <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onUse}
            className="inline-flex w-fit items-center gap-1 rounded-sm text-xs font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
            <Cog className="size-3.5 text-label" />
            Use "{name}"
        </button>
    );
}
