import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils.ts';
import '@/css/railway-ambience.css';

const STEAM = [
    { left: '2%', bottom: '0%', size: 240, duration: 22, delay: -6 },
    { left: '10%', bottom: '26%', size: 200, duration: 28, delay: -18 },
    { left: '7%', bottom: '-9%', size: 290, duration: 25, delay: -16 },
    { left: '92%', bottom: '4%', size: 280, duration: 24, delay: -11 },
    { left: '99%', bottom: '31%', size: 210, duration: 30, delay: -23 },
    { left: '87%', bottom: '-10%', size: 260, duration: 27, delay: -3 }
];

// Staggered bursts across each landing section: fresh steam forms while older puffs evaporate.
const LANDING_STEAM = [
    { left: '3%', bottom: '12%', size: 200, duration: 8.5, delay: -1 },
    { left: '95%', bottom: '66%', size: 220, duration: 10, delay: -5.5 },
    { left: '8%', bottom: '78%', size: 210, duration: 9.5, delay: -7 },
    { left: '91%', bottom: '8%', size: 230, duration: 9, delay: -3.5 },
    { left: '25%', bottom: '3%', size: 180, duration: 10.5, delay: -8.5 },
    { left: '77%', bottom: '85%', size: 190, duration: 11, delay: -2.5 }
];

/** Noninteractive steam sits behind the page's content. */
export function RailwayAmbience({ variant = 'hero', className }: { variant?: 'hero' | 'page' | 'landing'; className?: string }) {
    const landing = variant === 'landing';
    return (
        <div aria-hidden="true" className={cn('railway-ambience', `railway-ambience-${variant}`, className)}>
            {(landing ? LANDING_STEAM : STEAM).map((plume, index) => (
                <span key={index} className="railway-ambient-steam" style={{
                    left: plume.left,
                    bottom: plume.bottom,
                    width: landing ? `min(42vw, ${plume.size}px)` : plume.size,
                    height: landing ? `min(34vw, ${plume.size * .8}px)` : plume.size * 1.25,
                    '--steam-duration': `${plume.duration}s`,
                    '--steam-delay': `${plume.delay}s`,
                    '--steam-drift': `${index % 2 === 0 ? -35 : 40}px`
                } as CSSProperties} />
            ))}
        </div>
    );
}
