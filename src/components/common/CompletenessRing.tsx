// small ring showing how complete a record is (like "4 of 6"). the number is always printed
// next to it, so the ring is a glance aid, not the only way to read it.

import { cn } from '@/lib/utils.ts';

export function CompletenessRing({ done, total, size = 22, showLabel = true, className }: { done: number; total: number; size?: number; showLabel?: boolean; className?: string }) {
    const ratio = total ? done / total : 0;
    const stroke = 3;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const complete = done === total;
    return (
        <span className={cn('inline-flex items-center gap-1.5', className)} title={`${done} of ${total} record details filled in`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-inset)" strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={complete ? 'var(--color-good)' : 'var(--color-sbu-gold)'}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${c * ratio} ${c}`}
                />
            </svg>
            {showLabel && (
                <span className="text-xs tabular-nums text-muted-foreground">
                    {done}/{total}
                </span>
            )}
        </span>
    );
}
