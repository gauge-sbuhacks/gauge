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

/** Decoration only: rising steam stays at the edges of the page. */
export function RailwayAmbience({ variant = 'hero', className }: { variant?: 'hero' | 'page'; className?: string }) {
    return (
        <div aria-hidden="true" className={cn('railway-ambience', `railway-ambience-${variant}`, className)}>
            {STEAM.map((plume, index) => (
                <span key={index} className="railway-ambient-steam" style={{
                    left: plume.left,
                    bottom: plume.bottom,
                    width: plume.size,
                    height: plume.size * 1.25,
                    '--steam-duration': `${plume.duration}s`,
                    '--steam-delay': `${plume.delay}s`
                } as CSSProperties} />
            ))}
        </div>
    );
}
