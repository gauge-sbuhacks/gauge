import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils.ts';

/** A small side-view engine, drawn in the same brass linework as the rest of the brand. */
export function Locomotive({ className }: { className?: string }) {
    return (
        <svg aria-hidden="true" viewBox="0 0 64 40" fill="none" className={className}>
            <path d="M43 7h5m0-5h5m3 5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
            <path d="M47 13h7l-1 7h5v10H7V9h18v11h23l-1-7Z" fill="var(--background)" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M5 9h22M12 14h8v10h-8zM31 24h11m16 1 5 7H3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="15" cy="32" r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="35" cy="31" r="7" fill="var(--background)" stroke="currentColor" strokeWidth="2.5" />
            <circle cx="50" cy="32" r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2.5" />
            <path d="M15 32h35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

/** Decorative twin rails with sleepers; all meaning stays in the surrounding real text. */
export function RailDivider({ className }: { className?: string }) {
    return <div aria-hidden="true" className={cn('rail-track', className)} />;
}

/** Noninteractive progress: a locomotive moves between station stops as the actual step changes. */
export function RailProgress({ current, stops, label = 'Progress', className }: { current: number; stops: string[]; label?: string; className?: string }) {
    const total = Math.max(1, stops.length);
    const index = Math.max(0, Math.min(current, total - 1));
    const progress = total > 1 ? index / (total - 1) * 100 : 0;
    return (
        <div className={cn('rail-progress', className)} role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1} aria-valuetext={`Step ${index + 1} of ${total}: ${stops[index] ?? ''}`}>
            <div aria-hidden="true" className="flex items-center justify-between gap-4 text-xs">
                <span className="font-medium text-label">{stops[index]}</span>
                <span className="text-muted-foreground tabular-nums">{index + 1} of {total}</span>
            </div>
            <div aria-hidden="true" className="relative mx-5 mt-2 h-11">
                <div className="absolute inset-x-0 bottom-1.5"><RailDivider className="text-border-strong" /></div>
                <div className="absolute inset-x-0 bottom-1.5 h-2.5 overflow-hidden" style={{ width: `${progress}%` }}>
                    <RailDivider className="text-brass" />
                </div>
                {stops.map((stop, i) => <span key={`${i}-${stop}`} className={cn('rail-station absolute bottom-0.5', i <= index && 'rail-station-reached')} style={{ left: `${total > 1 ? i / (total - 1) * 100 : 0}%` }} />)}
                <span className="rail-engine absolute bottom-3 w-12 text-brass" style={{ left: `${progress}%` } as CSSProperties}>
                    <Locomotive className="h-8 w-12" />
                </span>
            </div>
            <div aria-hidden="true" className="mx-5 mt-1 hidden justify-between gap-2 sm:flex">
                {stops.map((stop, i) => <span key={`${i}-${stop}`} className={cn('w-0 whitespace-nowrap text-center text-[10px] tracking-wide uppercase', i === index ? 'font-semibold text-label' : 'text-muted-foreground')}><span className="inline-block -translate-x-1/2">{stop}</span></span>)}
            </div>
        </div>
    );
}
