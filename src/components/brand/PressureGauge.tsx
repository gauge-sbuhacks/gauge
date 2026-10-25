import { BRAND_BASE, clampPercent, cx, pressureStatus } from './status.ts';

export type GaugeVariant = 'boiler' | 'blackface' | 'manifold';

const GEOMETRY: Record<GaugeVariant, { w: number; h: number; pivotX: number; pivotY: number }> = {
    boiler: { w: 260, h: 260, pivotX: 130, pivotY: 130 },
    blackface: { w: 260, h: 260, pivotX: 130, pivotY: 130 },
    manifold: { w: 300, h: 380, pivotX: 150, pivotY: 150 },
};

export interface PressureGaugeProps {
    /** 0 to 100. Share of value that is uninsured or missing proof. */
    value: number;
    variant?: GaugeVariant;
    /** Rendered width in px; height follows the artwork's aspect ratio. */
    size?: number;
    className?: string;
    /** Where the kit's folders live under /public. */
    base?: string;
}

/**
  * Dial and needle are separate images. The needle file points straight up (a reading of 50),
  * so the component rotates it by (value - 50) * 2.4 degrees around the dial's pivot.
  * The needle eases into place; reduced-motion users get an instant jump.
  */
export function PressureGauge({ value, variant = 'boiler', size = 260, className, base = BRAND_BASE }: PressureGaugeProps) {
    const v = clampPercent(value);
    const g = GEOMETRY[variant];
    const status = pressureStatus(v);
    const height = Math.round((size * g.h) / g.w);
    const angle = (v - 50) * 2.4;

    return (
        <div
            role="img"
            aria-label={`Pressure ${Math.round(v)} percent, ${status.label.toLowerCase()}`}
            className={cx('relative shrink-0 select-none', className)}
            style={{ width: size, height }}
        >
            <img
                src={`${base}/gauge/${variant}-dial.svg`}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full"
            />
            <img
                src={`${base}/gauge/${variant}-needle-up.svg`}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full motion-safe:transition-transform motion-safe:duration-[900ms] motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: `${(g.pivotX / g.w) * 100}% ${(g.pivotY / g.h) * 100}%`,
                }}
            />
        </div>
    );
}
