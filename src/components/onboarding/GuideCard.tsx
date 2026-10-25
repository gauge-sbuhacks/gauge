// Gus's walkthrough note under each add-flow question: what this step is for, and a button that
// fills in the example car so a new account can watch an item go into the portfolio.

import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import type { GuideTip } from '@/lib/walkthrough.ts';
import { cn } from '@/lib/utils.ts';

export function GuideCard({
    tip,
    step,
    total,
    fillLabel,
    onFill,
    onExit,
    footnote,
    className
}: {
    tip: GuideTip;
    step: number;
    total: number;
    fillLabel?: string;
    onFill?: () => void;
    onExit: () => void;
    footnote?: string | null;
    className?: string;
}) {
    return (
        <aside aria-label="Walkthrough" className={cn('rounded-xl border border-brass/40 bg-brass-soft/60 p-4 sm:p-5', className)}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-brass uppercase">
                    Walkthrough · {step} of {total}
                </p>
                <button type="button" onClick={onExit} className="-m-1 inline-flex items-center gap-1 rounded p-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
                    <X className="size-3.5" aria-hidden />
                    Exit walkthrough
                </button>
            </div>
            <p className="mt-1.5 font-medium text-foreground">{tip.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{tip.text}</p>
            {onFill && (
                <Button type="button" size="sm" variant="outline" className="mt-3 bg-background" onClick={onFill}>
                    <Sparkles data-icon="inline-start" />
                    {fillLabel ?? 'Fill in the example'}
                </Button>
            )}
            {footnote && <p className="mt-3 text-xs text-muted-foreground">{footnote}</p>}
        </aside>
    );
}
