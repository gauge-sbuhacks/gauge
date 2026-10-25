// the fixed scene behind a page: pipeworks (the app and the question screens) or the steam room.
// the pipes are faded well back and a soft vignette keeps the middle clear, so they only frame the
// edges and never sit behind text. a few plumes of steam drift up from the sides; they hold still
// for anyone who has reduced motion turned on.

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils.ts';

// where each plume rises from, how big it is, and its timing (so they never move in step)
const PLUMES = [
    { left: '6%', bottom: '8%', size: 320, dur: 19, delay: 0 },
    { left: '14%', bottom: '38%', size: 240, dur: 23, delay: -9 },
    { left: '84%', bottom: '14%', size: 360, dur: 21, delay: -4 },
    { left: '92%', bottom: '52%', size: 260, dur: 25, delay: -15 },
    { left: '48%', bottom: '-6%', size: 420, dur: 27, delay: -12 }
];

export function Backdrop({ scene = 'pipeworks', className }: { scene?: 'pipeworks' | 'steamroom'; className?: string }) {
    return (
        <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
            <div className={cn('absolute inset-0 bg-cover bg-center opacity-40 dark:opacity-35', scene === 'pipeworks' ? 'bg-(image:--bg-pipeworks)' : 'bg-(image:--bg-steamroom)')} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--background)_45%,color-mix(in_oklab,var(--background)_60%,transparent)_78%,color-mix(in_oklab,var(--background)_25%,transparent)_100%)]" />
            {/* keep the top clear for the logo on pages without the top bar */}
            <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-background via-background/70 to-transparent" />
            {PLUMES.map((p, i) => (
                <span
                    key={i}
                    className="steam-plume absolute rounded-full bg-[radial-gradient(circle,var(--bg-steam)_0%,transparent_65%)] blur-2xl"
                    style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, marginLeft: -p.size / 2, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` } as CSSProperties}
                />
            ))}
        </div>
    );
}
