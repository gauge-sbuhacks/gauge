// how values show up everywhere: money or "Not entered" (never a fake $0), and signed gain/loss.
// gain/loss pairs color with an arrow + sign, so meaning never rides on color alone.

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { formatMoney, formatPercent } from '@/lib/format.ts';

export function NotEntered({ className, label = 'Not entered' }: { className?: string; label?: string }) {
    return <span className={cn('text-muted-foreground/80 italic', className)}>{label}</span>;
}

export function MoneyValue({ cents, compact, className }: { cents: number | null | undefined; compact?: boolean; className?: string }) {
    if (cents == null) return <NotEntered className={className} />;
    return <span className={cn('tabular-nums', className)}>{formatMoney(cents, { compact })}</span>;
}

export function GainLoss({
    cents,
    ratio,
    className,
    showIcon = true,
    compact
}: {
    cents: number;
    ratio?: number | null;
    className?: string;
    showIcon?: boolean;
    compact?: boolean;
}) {
    const up = cents > 0;
    const flat = cents === 0;
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', flat ? 'text-muted-foreground' : up ? 'text-gain' : 'text-loss', className)}>
            {showIcon && <Icon className="size-3.5 shrink-0" aria-hidden />}
            <span>
                {up ? '+' : flat ? '' : '−'}
                {formatMoney(Math.abs(cents), { compact })}
            </span>
            {ratio != null && <span className="opacity-80">({formatPercent(ratio, { signed: true })})</span>}
            <span className="sr-only">{up ? 'gain' : flat ? 'no change' : 'loss'}</span>
        </span>
    );
}
