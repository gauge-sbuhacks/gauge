// segmented control (a row of mutually exclusive options), used for the value type and time range filters.
// styled as the kit's brass tabs: an inset track, with the chosen option as a polished brass plate

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
        <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full flex-wrap gap-[3px] rounded-[9px] border border-border bg-inset p-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]', className)}>
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
                            'rounded-[6px] border font-display font-extrabold tracking-[0.05em] whitespace-nowrap uppercase transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            size === 'sm' ? 'h-7 px-2.5 text-[14px]' : 'h-9 px-3.5 text-[16px]',
                            active
                                ? 'border-[#5A3A06] bg-[linear-gradient(180deg,#FAD06A,#F4A906_52%,#C68A06)] text-sbu-umber shadow-[inset_0_1px_0_rgba(255,250,220,0.75)]'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
