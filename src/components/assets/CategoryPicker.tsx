// category picker: a grid of cards (a radio group). picking one reveals that category's fields

import { CATEGORIES, type CategoryId } from '@shared/categories.ts';
import { categoryIcon } from '@/components/common/CategoryIcon.tsx';
import { categoryColor } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

export function CategoryPicker({ value, onChange, invalid }: { value: CategoryId | ''; onChange: (id: CategoryId) => void; invalid?: boolean }) {
    return (
        <div role="radiogroup" aria-label="Category" aria-invalid={invalid || undefined} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORIES.map((c) => {
                const Icon = categoryIcon(c.id);
                const active = value === c.id;
                return (
                    <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${c.label}: ${c.hint}`}
                        onClick={() => onChange(c.id)}
                        className={cn(
                            'flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                            active ? 'border-foreground/60 bg-muted ring-1 ring-foreground/30' : 'border-border hover:bg-muted/60',
                            invalid && !value && 'border-destructive/60'
                        )}
                    >
                        <span className="relative mt-0.5">
                            <Icon className="size-4" strokeWidth={1.75} />
                            <span className="absolute -right-1 -bottom-1 size-2 rounded-full ring-2 ring-card" style={{ background: categoryColor(c.id) }} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-medium">{c.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
