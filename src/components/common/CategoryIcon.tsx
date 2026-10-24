// one icon per category. the colored dot next to it carries the chart color (icons stay ink-colored)

import { Car, Gem, House, Laptop, Package, Sofa, Trophy, Watch, Wrench, type LucideIcon } from 'lucide-react';
import type { CategoryId } from '@shared/categories.ts';
import { cn } from '@/lib/utils.ts';
import { categoryColor } from '@/lib/portfolio.ts';

const ICONS: Record<CategoryId, LucideIcon> = {
    vehicle: Car,
    property: House,
    watch: Watch,
    jewelry: Gem,
    collectible: Trophy,
    electronics: Laptop,
    household: Sofa,
    equipment: Wrench,
    other: Package
};

export function categoryIcon(id: CategoryId): LucideIcon {
    return ICONS[id] ?? Package;
}

// icon in a soft tile, with the category's chart color as a small corner dot
export function CategoryBadgeIcon({ id, className }: { id: CategoryId; className?: string }) {
    const Icon = categoryIcon(id);
    return (
        <span className={cn('relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80', className)}>
            <Icon className="size-[18px]" strokeWidth={1.75} />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card" style={{ background: categoryColor(id) }} />
        </span>
    );
}

export function SeriesDot({ color, className }: { color: string; className?: string }) {
    return <span className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />;
}
