// a small chip saying where a value came from: manual entry, market data, AI estimate, appraisal, or test data

import { BadgeCheck, Database, FlaskConical, PenLine, Sparkles } from 'lucide-react';
import { VALUE_ORIGIN_LABELS, type ValueOrigin } from '@/lib/valueOrigin.ts';
import { cn } from '@/lib/utils.ts';

const STYLE: Record<ValueOrigin, { icon: typeof PenLine; className: string }> = {
    manual: { icon: PenLine, className: 'border-border text-foreground' },
    market: { icon: Database, className: 'border-brass/40 bg-brass-soft text-brass' },
    ai: { icon: Sparkles, className: 'border-primary/30 bg-primary/5 text-foreground' },
    appraisal: { icon: BadgeCheck, className: 'border-gain/40 text-gain' },
    sample: { icon: FlaskConical, className: 'border-border text-muted-foreground' }
};

export function ValueOriginTag({ origin, label, className }: { origin: ValueOrigin; label?: string; className?: string }) {
    const s = STYLE[origin];
    const Icon = s.icon;
    const text = label ?? VALUE_ORIGIN_LABELS[origin];
    return (
        <span
            title={label && label !== VALUE_ORIGIN_LABELS[origin] ? `${VALUE_ORIGIN_LABELS[origin]}: ${label}` : undefined}
            className={cn('inline-flex max-w-full items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 font-medium', s.className, className)}
        >
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{text}</span>
        </span>
    );
}
