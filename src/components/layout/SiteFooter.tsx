// the footer on every page: copyright and the three legal pages.
// `note` adds a line above (the landing page uses it), `width` matches the page it sits under.

import { Link } from 'react-router';
import { BRAND_BASE } from '@/components/brand/status.ts';
import { COPYRIGHT, LEGAL_LINKS } from '@/config.ts';
import { cn } from '@/lib/utils.ts';

export function SiteFooter({ note, width = 'max-w-7xl', className }: { note?: string; width?: string; className?: string }) {
    return (
        <footer className={cn('border-t bg-background', className)}>
            <div className={cn('mx-auto flex flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8', width)}>
                {note && <p>{note}</p>}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2">
                        <img src={`${BRAND_BASE}/logo/badge-mark-small.svg`} alt="" width={18} height={18} className="shrink-0" />
                        {COPYRIGHT}
                    </p>
                    <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {LEGAL_LINKS.map((l) => (
                            <Link key={l.to} to={l.to} className="transition-colors hover:text-foreground hover:underline">
                                {l.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </div>
        </footer>
    );
}
