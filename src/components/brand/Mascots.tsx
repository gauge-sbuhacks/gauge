import type { ReactNode } from 'react';
import { BRAND_BASE, cx } from './status.ts';

export type GusPose = 'calm' | 'alarm' | 'certify';
export type BoylePose = 'watch' | 'alarm';
export type PuffPose = 'happy' | 'wink' | 'whoosh';

/** Calm below 75, venting steam at 75 and up. Use 'certify' for the save moment. */
export function gusPoseFor(pressure: number): GusPose {
    return pressure >= 75 ? 'alarm' : 'calm';
}

const GUS_ALT: Record<GusPose, string> = {
    calm: 'Gus the boiler inspector, calm',
    alarm: 'Gus the boiler inspector, venting steam',
    certify: 'Gus the boiler inspector, stamping a certificate',
};

interface MascotBase {
    /** Rendered width in px. */
    size?: number;
    className?: string;
    base?: string;
}

export function Gus({ pose, pressure = 0, size = 96, className, base = BRAND_BASE }: MascotBase & { pose?: GusPose; pressure?: number }) {
    const p = pose ?? gusPoseFor(pressure);
    return (
        <img
            src={`${base}/mascot/gus-${p}.svg`}
            alt={GUS_ALT[p]}
            width={size}
            height={Math.round((size * 400) / 320)}
            draggable={false}
            className={cx('shrink-0 select-none', className)}
        />
    );
}

export function Boyle({ pose = 'watch', size = 96, className, base = BRAND_BASE }: MascotBase & { pose?: BoylePose }) {
    return (
        <img
            src={`${base}/mascot/boyle-${pose}.svg`}
            alt={pose === 'watch' ? 'Boyle the owl, on watch' : 'Boyle the owl, alarmed'}
            width={size}
            height={Math.round((size * 400) / 320)}
            draggable={false}
            className={cx('shrink-0 select-none', className)}
        />
    );
}

export function Puff({ pose = 'happy', size = 72, className, base = BRAND_BASE }: MascotBase & { pose?: PuffPose }) {
    return (
        <img
            src={`${base}/mascot/puff-${pose}.svg`}
            alt=""
            aria-hidden
            width={size}
            height={Math.round((size * 200) / 220)}
            draggable={false}
            className={cx('shrink-0 select-none', className)}
        />
    );
}

/** Gus with a ticket-cream speech bubble, as on the dashboard's Pressure card. */
export function GusSays({ pressure, children, className }: { pressure: number; children: ReactNode; className?: string }) {
    return (
        <div className={cx('flex items-end gap-2.5', className)}>
            <Gus pressure={pressure} size={78} />
            <p className="mb-6 rounded-[10px] border-[1.5px] border-[#8F4C2E] bg-sbu-cream px-3.5 py-2.5 text-[13px] leading-snug text-sbu-umber">
                {children}
            </p>
        </div>
    );
}
