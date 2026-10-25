// the fixed scene behind a page: pipeworks (the app and the question screens) or the steam room.
// a soft vignette keeps the middle clear, so the pipes frame the edges and never sit behind text

import { cn } from '@/lib/utils.ts';

export function Backdrop({ scene = 'pipeworks', className }: { scene?: 'pipeworks' | 'steamroom'; className?: string }) {
    return (
        <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10', className)}>
            <div className={cn('absolute inset-0 bg-cover bg-center', scene === 'pipeworks' ? 'bg-(image:--bg-pipeworks)' : 'bg-(image:--bg-steamroom)')} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_38%,color-mix(in_oklab,var(--background)_55%,transparent)_70%,transparent_100%)]" />
            {/* keep the top clear for the logo on pages without the top bar */}
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-background via-background/70 to-transparent" />
        </div>
    );
}
