// small form helpers: a labeled field wrapper, a $ money input, and a select that allows "not entered"

import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { cn } from '@/lib/utils.ts';

export function Field({
    label,
    htmlFor,
    error,
    help,
    optional,
    className,
    children
}: {
    label: ReactNode;
    htmlFor?: string;
    error?: string;
    help?: ReactNode;
    optional?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <Label htmlFor={htmlFor} className="text-sm">
                {label}
                {optional === false && <span className="text-loss">*</span>}
            </Label>
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
