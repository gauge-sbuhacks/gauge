// placeholder mark: a small value gauge. swap for the real logo during the theme pass

import { APP_NAME } from '@/config.ts';
import { cn } from '@/lib/utils.ts';

export function LogoMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
            <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
            <path d="M7 19a9 9 0 0 1 18 0" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 19 L22 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="16" cy="19" r="2.4" fill="currentColor" />
        </svg>
    );
}

export function Logo({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            <LogoMark className="text-sidebar-primary" />
            <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </span>
    );
}
