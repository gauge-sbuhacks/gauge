import type { PlatformId } from '@shared/marketplace.ts';

// Small, self-contained brand wordmarks stay legible without third-party image requests.
export function PlatformLogo({ platform }: { platform: PlatformId }) {
    return <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-xl border bg-white" aria-hidden="true">
        {platform === 'ebay' && <svg viewBox="0 0 100 44" className="w-16"><text x="4" y="32" fontFamily="Arial,sans-serif" fontSize="38" letterSpacing="-3"><tspan fill="#e53238">e</tspan><tspan fill="#0064d2">b</tspan><tspan fill="#f5af02">a</tspan><tspan fill="#86b817">y</tspan></text></svg>}
        {platform === 'facebook' && <svg viewBox="0 0 32 32" className="size-8"><rect width="32" height="32" rx="8" fill="#0866ff"/><path d="M18.8 29V17.2h4l.6-4.6h-4.6V9.7c0-1.3.4-2.2 2.3-2.2h2.5V3.4c-.4-.1-1.9-.2-3.6-.2-3.6 0-6.1 2.2-6.1 6.2v3.2H10v4.6h3.9V29z" fill="white"/></svg>}
        {platform === 'zillow' && <svg viewBox="0 0 90 44" className="w-16"><path d="M3 21 20 7l17 14v17H3Z" fill="#006aff"/><path d="m10 19 19-4-15 15 15-3" fill="none" stroke="white" strokeWidth="4"/><text x="41" y="29" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="13" fill="#006aff">Zillow</text></svg>}
        {platform === 'cars' && <svg viewBox="0 0 105 44" className="w-16"><rect y="6" width="105" height="32" rx="16" fill="#532380"/><text x="9" y="29" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="23" fill="white">cars.com</text></svg>}
    </span>;
}
