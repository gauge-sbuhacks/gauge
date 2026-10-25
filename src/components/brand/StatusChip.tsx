import { CircleAlert, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { cx, pressureStatus, type PressureLevel } from './status.ts';

const ICONS = {
    good: CircleCheck,
    warning: CircleAlert,
    serious: TriangleAlert,
    critical: OctagonAlert,
} as const;

const TONES: Record<PressureLevel, string> = {
    good: 'text-good-text border-good/45 bg-good/15',
    warning: 'text-warning-text border-warning/45 bg-warning/15',
    serious: 'text-serious-text border-serious/45 bg-serious/15',
    critical: 'text-critical-text border-critical/45 bg-critical/15',
};

/** Status always pairs color with an icon and a label, never color alone. */
export function StatusChip({ value, className }: { value: number; className?: string }) {
    const status = pressureStatus(value);
    const Icon = ICONS[status.level];
    return (
        <span
            className={cx(
                'inline-flex h-[30px] items-center gap-1.5 rounded-sm border px-3 text-[11.5px] font-bold uppercase tracking-[0.1em] [font-stretch:125%]',
                TONES[status.level],
                className,
            )}
        >
            <Icon className="size-[15px]" strokeWidth={2.4} aria-hidden />
            {status.label}
        </span>
    );
}
