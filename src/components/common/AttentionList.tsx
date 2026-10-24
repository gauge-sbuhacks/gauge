// "needs attention" rows. severity is shown with an icon + label, never color alone

import { ChevronRight, CircleAlert, Flame, Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import type { AttentionItem, Severity } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

export const SEVERITY: Record<Severity, { icon: typeof Info; label: string; className: string }> = {
    critical: { icon: Flame, label: 'Critical', className: 'text-loss' },
    serious: { icon: TriangleAlert, label: 'Important', className: 'text-[#b4532a]' },
    warning: { icon: CircleAlert, label: 'Heads up', className: 'text-[#9a6a00]' },
    info: { icon: Info, label: 'Info', className: 'text-muted-foreground' }
};

export function AttentionList({ items, limit, showAsset = true }: { items: AttentionItem[]; limit?: number; showAsset?: boolean }) {
    const shown = limit ? items.slice(0, limit) : items;
    if (items.length === 0) {
        return <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs attention right now.</p>;
    }
    return (
        <ul className="-mx-2 divide-y divide-border">
            {shown.map((a) => {
                const s = SEVERITY[a.severity];
                return (
                    <li key={a.id}>
                        <Link to={`/assets/${a.assetId}`} className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
                            <s.icon className={cn('mt-0.5 size-4 shrink-0', s.className)} aria-label={s.label} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{a.title}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {showAsset && <span className="text-foreground/80">{a.assetName}. </span>}
                                    {a.detail}
                                </div>
                            </div>
                            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
