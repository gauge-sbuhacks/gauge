// the category-specific part of the form. fields come from shared/categories.ts and appear
// progressively (pick "Trading card" and the set / grade / cert fields show up).
// `keys` limits it to some fields, in that order (the step-by-step add flow asks a few at a time).

import { Controller, type UseFormReturn } from 'react-hook-form';
import { LoaderCircle, ScanSearch } from 'lucide-react';
import { fieldRole, getCategory, isFieldVisible, type CategoryField, type CategoryId, type Details } from '@shared/categories.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import type { AssetFormValues } from '@/lib/assetForm.ts';
import { cn } from '@/lib/utils.ts';
import { Field, OptionalSelect, UnitInput } from './FormBits.tsx';

const BOOL_OPTIONS = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
];

export function CategoryFields({
    form,
    category,
    onDecodeVin,
    decoding,
    onLookupWatchReference,
    lookingUpWatch,
    keys
}: {
    form: UseFormReturn<AssetFormValues>;
    category: CategoryId;
    keys?: string[];
    onDecodeVin?: () => void;
    decoding?: boolean;
    onLookupWatchReference?: () => void;
    lookingUpWatch?: boolean;
}) {
    let def = getCategory(category);
    const details = form.watch('details') ?? {};
    const errors = form.formState.errors.details as Record<string, { message?: string }> | undefined;

    if (keys) {
        const picked = keys.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is CategoryField => f != null);
        def = { ...def, fields: picked };
        if (picked.length === 0) return null;
    }

    if (def.fields.length === 0) {
        return <p className="text-sm text-muted-foreground">No extra fields for this category. Use notes for anything specific.</p>;
    }

    // visibility only cares about select values, which are stored as plain strings
    const visible = def.fields.filter((f) => isFieldVisible(f, details as Details));

    const renderInput = (f: CategoryField) => {
        const id = `detail-${f.key}`;
        const name = `details.${f.key}` as const;
        const invalid = Boolean(errors?.[f.key]);

        if (f.type === 'select' || f.type === 'boolean') {
            return (
                <Controller
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                        <OptionalSelect id={id} value={field.value ?? ''} onChange={field.onChange} options={f.type === 'boolean' ? BOOL_OPTIONS : (f.options ?? [])} invalid={invalid} />
                    )}
                />
            );
        }

        if (f.key === 'referenceNumber' && onLookupWatchReference) {
            return (
                <div className="flex gap-2">
                    <Input
                        id={id}
                        {...form.register(name)}
                        placeholder={f.placeholder}
                        maxLength={f.maxLength}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={invalid || undefined}
                        className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                    />
                    <Button type="button" variant="outline" onClick={onLookupWatchReference} disabled={lookingUpWatch}>
                        {lookingUpWatch ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
                        Look up
                    </Button>
                </div>
            );
        }

        if (f.key === 'vin' && onDecodeVin) {
            return (
                <div className="flex gap-2">
                    <Input
                        id={id}
                        {...form.register(name)}
                        placeholder={f.placeholder}
                        maxLength={f.maxLength}
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={invalid || undefined}
                        className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
                    />
                    <Button type="button" variant="outline" onClick={onDecodeVin} disabled={decoding}>
                        {decoding ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
                        Decode
                    </Button>
                </div>
            );
        }

        const numeric = f.type === 'number' || f.type === 'integer';
        return (
            <UnitInput
                id={id}
                unit={f.unit}
                type={f.type === 'date' ? 'date' : 'text'}
                inputMode={numeric ? (f.type === 'integer' ? 'numeric' : 'decimal') : undefined}
                placeholder={f.placeholder}
                maxLength={f.type === 'text' ? (f.maxLength ?? 200) : undefined}
                autoComplete="off"
                spellCheck={f.mono ? false : undefined}
                aria-invalid={invalid || undefined}
                className={cn(f.mono && 'font-mono', f.uppercase && 'uppercase', numeric && 'tabular-nums')}
                {...form.register(name)}
            />
        );
    };

    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((f) => (
                <Field
                    key={f.key}
                    label={f.label}
                    htmlFor={`detail-${f.key}`}
                    error={errors?.[f.key]?.message}
                    tag={fieldRole(category, f.key)}
                    help={f.help ?? (f.sensitive && f.key === 'addressLine1' ? 'Private to your account. Only sent to RentCast if you run a value lookup.' : undefined)}
                    className={cn(f.wide && 'sm:col-span-2')}
                >
                    {renderInput(f)}
                </Field>
            ))}
        </div>
    );
}
