// the fixed scene behind a page: pipeworks (the app and the question screens) or the steam room.
// the pipes are faded well back and a soft vignette keeps the middle clear, so they only frame the
// edges and never sit behind text. Rising steam shares the hero's ambience.

import { cn } from '@/lib/utils.ts';
import { RailwayAmbience } from './RailwayAmbience.tsx';

export function Backdrop({ scene = 'pipeworks', className }: { scene?: 'pipeworks' | 'steamroom'; className?: string }) {
    return (
        <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
            <div className={cn('absolute inset-0 bg-cover bg-center opacity-40 dark:opacity-35', scene === 'pipeworks' ? 'bg-(image:--bg-pipeworks)' : 'bg-(image:--bg-steamroom)')} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_45%,color-mix(in_oklab,var(--background)_60%,transparent)_78%,color-mix(in_oklab,var(--background)_25%,transparent)_100%)]" />
            {/* keep the top clear for the logo on pages without the top bar */}
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-background via-background/70 to-transparent" />
            <RailwayAmbience variant="page" />
        </div>
    );
}
