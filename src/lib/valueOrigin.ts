// where a recorded value came from, in the words the app shows: a number you typed in (manual entry),
// market data from a provider, an AI price check, a professional appraisal, or test data.

import { PRICE_CHECK_SOURCE, type ValuationSource } from '@shared/schemas.ts';

export type ValueOrigin = 'manual' | 'market' | 'ai' | 'appraisal' | 'sample';

export const VALUE_ORIGIN_LABELS: Record<ValueOrigin, string> = {
    manual: 'Manual entry',
    market: 'Market data',
    ai: 'AI estimate',
    appraisal: 'Appraisal',
    sample: 'Test data'
};

// older add-flow saves typed values as a provider value named "Entered during add"
const LEGACY_MANUAL = 'Entered during add';

export function valueOriginOf(v: { source: ValuationSource; sourceName: string | null }): ValueOrigin {
    if (v.source === 'user') return 'manual';
    if (v.source === 'appraisal') return 'appraisal';
    if (v.source === 'sample') return 'sample';
    if (v.sourceName === LEGACY_MANUAL) return 'manual';
    if (v.sourceName === PRICE_CHECK_SOURCE) return 'ai';
    return 'market';
}

// the short text for a value's source: the provider's name for market data ("VinAudit retail"),
// otherwise the origin ("Manual entry")
export function valueSourceText(v: { source: ValuationSource; sourceName: string | null }): string {
    const origin = valueOriginOf(v);
    if ((origin === 'market' || origin === 'appraisal') && v.sourceName) return v.sourceName;
    return VALUE_ORIGIN_LABELS[origin];
}
