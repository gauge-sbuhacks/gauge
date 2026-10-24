// a labeled headline number with a line of context underneath (coverage, delta...)

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';

export function StatTile({
    label,
    value,
    sub,
    icon,
    className
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    icon?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10', className)}>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
    );
}
