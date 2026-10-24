// segmented control (a row of mutually exclusive options), used for the value type and time range filters

import { cn } from '@/lib/utils.ts';

export interface SegmentOption<T extends string> {
    value: T;
    label: string;
    title?: string;
}

export function Segmented<T extends string>({
    value,
    onChange,
    options,
    label,
    size = 'default',
    className
}: {
    value: T;
    onChange: (v: T) => void;
    options: SegmentOption<T>[];
    label: string;
    size?: 'sm' | 'default';
    className?: string;
}) {
    return (
        // wraps onto a second row on narrow phones instead of running off the screen
        <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full flex-wrap rounded-lg bg-muted p-0.5', className)}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={o.title}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
                            active ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
