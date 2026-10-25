// The pressure badge beside the GAUGE wordmark. Compact scales both down for tight spots.

import { BRAND_BASE } from '@/components/brand/status.ts';
import { APP_NAME } from '@/config.ts';
import { cn } from '@/lib/utils.ts';

export function LogoMark({ size = 34, className }: { size?: number; className?: string }) {
    return <img src={`${BRAND_BASE}/logo/badge-mark-small.svg`} alt="" width={size} height={size} draggable={false} className={cn('shrink-0 select-none', className)} />;
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5', className)}>
            <LogoMark size={compact ? 28 : 34} />
            <span className={cn('font-display leading-[0.9] font-black tracking-[0.03em] uppercase', compact ? 'text-[22px]' : 'text-[26px]')}>{APP_NAME}</span>
        </span>
    );
}
