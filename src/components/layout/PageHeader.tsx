// page title row: title + optional description on the left, actions on the right.
// titles use the kit's Big Shoulders caps; empty states get Boyle the owl keeping watch

import type { ReactNode } from 'react';
import { Boyle } from '@/components/brand/Mascots.tsx';
import { cn } from '@/lib/utils.ts';

export function PageHeader({
    title,
    description,
    actions,
    eyebrow,
    className
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    eyebrow?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0">
                {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
                <h1 className="font-display text-4xl leading-[0.95] font-black tracking-[0.01em] uppercase sm:text-5xl">{title}</h1>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    actions,
    mascot = true
}: {
    icon?: ReactNode;
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
    // Boyle the owl stands in for the icon; pass false to show the icon instead
    mascot?: boolean;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-card/80 px-6 py-12 text-center">
            {mascot ? <Boyle size={88} className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none" /> : icon && <div className="text-muted-foreground">{icon}</div>}
            <div>
                <h2 className="font-display text-2xl font-extrabold tracking-[0.02em] uppercase">{title}</h2>
                {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
        </div>
    );
}
