import { clampPercent, cx } from './status.ts';

/**
  * The 'engine' readout: a boiler sight glass that fills with brass as records get completed.
  * Steam = power from good records. Keep it separate from the Pressure gauge (risk).
  */
export function SightGlass({
    value,
    label = 'Engine',
    detail,
    className,
}: {
    /** 0 to 100, e.g. record details completed / total. */
    value: number;
    label?: string;
    detail?: string;
    className?: string;
}) {
    const v = clampPercent(value);
    return (
        <div className={cx('flex flex-col gap-2 rounded-md border border-border bg-card p-3.5', className)} style={{ boxShadow: 'var(--hairline-top)' }}>
            <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-label [font-stretch:125%]">{label}</span>
                <span className="text-lg font-extrabold tabular-nums [font-stretch:78%]">{Math.round(v)}%</span>
            </div>
            <div
                role="img"
                aria-label={`${label} ${Math.round(v)} percent`}
                className="relative h-[18px] overflow-hidden rounded-full border-2 border-[#9A6A06] bg-inset shadow-[inset_0_2px_5px_rgba(0,0,0,0.6)]"
            >
                <div
                    className="absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-700"
                    style={{ width: `${v}%`, background: 'linear-gradient(180deg, #FCE3A8, #F4A906 45%, #9A6A06)' }}
                />
                <div className="absolute inset-x-1.5 top-[3px] h-[3px] rounded-full bg-white/30" />
            </div>
            {detail && <span className="text-xs text-subtle-foreground">{detail}</span>}
        </div>
    );
}
