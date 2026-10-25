import { BRAND_BASE, cx } from './status.ts';

export type MarkVariant = 'badge' | 'pipe' | 'seal';

const MARK_FILE: Record<MarkVariant, string> = {
    badge: 'logo/badge-mark-small.svg',
    pipe: 'logo/pipe-g-flat.svg',
    seal: 'logo/seal-small.svg',
};

/** The small mark only (sidebar, top bar, favicon-sized spots). */
export function BrandMark({ variant = 'badge', size = 38, className, base = BRAND_BASE }: { variant?: MarkVariant; size?: number; className?: string; base?: string }) {
    return (
        <img
            src={`${base}/${MARK_FILE[variant]}`}
            alt=""
            width={size}
            height={size}
            draggable={false}
            className={cx('shrink-0 select-none', className)}
        />
    );
}

/** Mark + live-text wordmark + tagline, as in the sidebar. Text stays real text so it themes. */
export function BrandLockup({ variant = 'badge', compact = false, className }: { variant?: MarkVariant; compact?: boolean; className?: string }) {
    return (
        <span className={cx('flex items-center gap-2.5 text-foreground', className)}>
            <BrandMark variant={variant} size={compact ? 32 : 38} />
            <span className="flex flex-col gap-0.5">
                <span className={cx('font-display font-black leading-[0.9] tracking-[0.03em]', compact ? 'text-[25px]' : 'text-[30px]')}>GAUGE</span>
                <span className="whitespace-nowrap text-[8px] font-bold tracking-[0.1em] text-label [font-stretch:125%]">KEEP THE PRESSURE OFF</span>
            </span>
        </span>
    );
}
