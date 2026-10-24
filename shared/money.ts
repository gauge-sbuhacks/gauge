// money helpers shared by the api and the app.
// every amount is stored as integer cents with an explicit currency, so floats never round a price wrong
// and "not entered" (null) stays different from a real $0.

export const SUPPORTED_CURRENCIES = ['USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

// $100 billion. anything bigger is almost certainly a typo
export const MAX_CENTS = 10_000_000_000_000;

// "1,234.56" or "$1234" -> 123456. empty -> null (not entered). junk -> undefined (invalid)
export function parseMoneyInput(raw: string): number | null | undefined {
    const cleaned = raw.replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return undefined;

    const [whole, frac = ''] = cleaned.split('.');
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return undefined;
    return cents;
}

// 123456 -> "1234.56" for putting back into an input box
export function centsToInput(cents: number | null | undefined): string {
    if (cents == null) return '';
    const whole = Math.floor(cents / 100);
    const frac = cents % 100;
    return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

// the one number we use for a valuation: the amount, or the middle of a low/high range
export function representativeCents(v: { amountCents: number | null; lowCents: number | null; highCents: number | null }): number | null {
    if (v.amountCents != null) return v.amountCents;
    if (v.lowCents != null && v.highCents != null) return Math.round((v.lowCents + v.highCents) / 2);
    return null;
}
