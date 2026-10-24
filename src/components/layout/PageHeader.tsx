// page title row: title + optional description on the left, actions on the right

import type { ReactNode } from 'react';
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
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function EmptyState({ icon, title, description, actions }: { icon?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-14 text-center">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
        </div>
    );
}
