// the pressure gauge: how much of your value is undocumented or uninsured.
// zones use the reserved status colors, and the reading is always printed as a number + label + icon.

import { CircleCheck, Flame, Gauge, TriangleAlert } from 'lucide-react';
import type { Pressure, PressureLevel } from '@/lib/portfolio.ts';
import { formatMoney, formatPercent } from '@/lib/format.ts';
import { cn } from '@/lib/utils.ts';

const CX = 100;
const CY = 100;
const R = 80;

function polar(angleDeg: number, r = R) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

// arc between two ratios (0 = left, 1 = right) over the top
function arc(from: number, to: number) {
    const a = polar(180 - from * 180);
    const b = polar(180 - to * 180);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const ZONES: { from: number; to: number; color: string }[] = [
    { from: 0, to: 0.25, color: 'var(--color-good)' },
    { from: 0.25, to: 0.5, color: 'var(--color-warning)' },
    { from: 0.5, to: 0.75, color: 'var(--color-serious)' },
    { from: 0.75, to: 1, color: 'var(--color-critical)' }
];

export const LEVEL_INFO: Record<PressureLevel, { label: string; icon: typeof Gauge; className: string }> = {
    low: { label: 'Low pressure', icon: CircleCheck, className: 'text-gain' },
    building: { label: 'Pressure building', icon: Gauge, className: 'text-[#9a6a00]' },
    high: { label: 'High pressure', icon: TriangleAlert, className: 'text-[#b4532a]' },
    critical: { label: 'Critical pressure', icon: Flame, className: 'text-loss' }
};

export function PressureGauge({ pressure }: { pressure: Pressure }) {
    const ratio = pressure.ratio ?? 0;
    const info = pressure.level ? LEVEL_INFO[pressure.level] : null;
    const gap = 0.012;

    return (
        <div className="flex flex-col items-center">
            <svg viewBox="0 0 200 118" className="w-full max-w-[17rem]" role="img" aria-label={pressure.ratio == null ? 'No values yet' : `${formatPercent(ratio)} of value at risk`}>
                {ZONES.map((z) => (
                    <path
                        key={z.from}
                        d={arc(z.from + (z.from === 0 ? 0 : gap / 2), z.to - (z.to === 1 ? 0 : gap / 2))}
                        fill="none"
                        stroke={z.color}
                        strokeWidth={12}
                        strokeOpacity={pressure.ratio == null ? 0.25 : 0.9}
                    />
                ))}
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const p = polar(180 - t * 180, R - 16);
                    return (
                        <text key={t} x={p.x} y={p.y + 3} textAnchor="middle" fontSize="8" fill="var(--color-chart-axis)">
                            {t * 100}
                        </text>
                    );
                })}
                {pressure.ratio != null && (
                    <g style={{ transform: `rotate(${ratio * 180}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: 'transform 700ms cubic-bezier(.3,1.3,.5,1)' }}>
                        <line x1={CX} y1={CY} x2={CX - (R - 8)} y2={CY} stroke="var(--color-foreground)" strokeWidth={3} strokeLinecap="round" />
                    </g>
                )}
                <circle cx={CX} cy={CY} r={7} fill="var(--color-foreground)" />
                <circle cx={CX} cy={CY} r={2.5} fill="var(--color-card)" />
            </svg>

            <div className="-mt-1 text-center">
                {pressure.ratio != null && <div className="text-3xl font-semibold tracking-tight">{formatPercent(ratio, { digits: 0 })}</div>}
                {info ? (
                    <div className={cn('mt-0.5 inline-flex items-center gap-1 text-sm font-medium', info.className)}>
                        <info.icon className="size-4" />
                        {info.label}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">Add values to take a reading</div>
                )}
            </div>
        </div>
    );
}

export function PressureBreakdown({ pressure }: { pressure: Pressure }) {
    const rows = [
        { label: 'Insured and documented', cents: pressure.protectedCents, color: 'var(--color-good)' },
        { label: 'Insured, missing proof', cents: pressure.undocumentedCents, color: 'var(--color-warning)' },
        { label: 'Not insured or not entered', cents: pressure.uncoveredCents, color: 'var(--color-critical)' }
    ];
    return (
        <dl className="space-y-1.5 text-sm">
            {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                        <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
                        {r.label}
                    </dt>
                    <dd className="tabular-nums">{formatMoney(r.cents)}</dd>
                </div>
            ))}
            {pressure.unvaluedCount > 0 && (
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <dt className="flex items-center gap-2">
                        <span className="size-2.5 rounded-[3px] border border-dashed border-muted-foreground/60" />
                        No value yet (not counted)
                    </dt>
                    <dd className="tabular-nums">
                        {pressure.unvaluedCount} item{pressure.unvaluedCount === 1 ? '' : 's'}
                    </dd>
                </div>
            )}
        </dl>
    );
}
