// the shapes that cross the wire: request schemas (zod) and saved-record types.
// on purpose there are separate schemas for "create", "partial update", and "lookup suggestion",
// because a half-finished edit and an uncertain suggestion have different rules than a saved record.

import { z } from 'zod';
import { CATEGORY_IDS, type CategoryId, type Details } from './categories.js';
import { MAX_CENTS, SUPPORTED_CURRENCIES, type Currency } from './money.js';

// ---------- enums ----------

export const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
    new: 'New',
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor'
};

export const CONDITION_HINTS: Record<Condition, string> = {
    new: 'Unused, in original packaging',
    excellent: 'Barely used, no visible wear',
    good: 'Normal wear, fully working',
    fair: 'Visible wear or minor issues',
    poor: 'Damaged or needs repair'
};

export const INSURANCE_STATUSES = ['insured', 'scheduled', 'not_insured'] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

export const INSURANCE_LABELS: Record<InsuranceStatus, string> = {
    insured: 'Insured',
    scheduled: 'Scheduled on policy',
    not_insured: 'Not insured'
};

export const INSURANCE_HINTS: Record<InsuranceStatus, string> = {
    insured: 'Covered by a homeowners, renters, or auto policy',
    scheduled: 'Listed individually on a policy (common for jewelry, watches, art)',
    not_insured: 'No coverage for this item'
};

// value types we record as dated observations. cost basis comes from purchase info instead
export const OBSERVED_VALUE_TYPES = ['fair_market', 'replacement', 'liquidation'] as const;
export type ObservedValueType = (typeof OBSERVED_VALUE_TYPES)[number];

export const VALUE_TYPES = ['fair_market', 'replacement', 'liquidation', 'cost_basis'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
    fair_market: 'Fair market value',
    replacement: 'Replacement cost',
    liquidation: 'Liquidation value',
    cost_basis: 'Cost basis'
};

export const VALUE_TYPE_SHORT: Record<ValueType, string> = {
    fair_market: 'Fair market',
    replacement: 'Replacement',
    liquidation: 'Liquidation',
    cost_basis: 'Cost basis'
};

export const VALUE_TYPE_HINTS: Record<ValueType, string> = {
    fair_market: 'What it would sell for between a willing buyer and seller',
    replacement: 'What it would cost to replace today (what insurers care about)',
    liquidation: 'What you would get selling it quickly',
    cost_basis: 'What you paid, from the purchase info'
};

export const VALUATION_SOURCES = ['user', 'appraisal', 'provider', 'sample'] as const;
export type ValuationSource = (typeof VALUATION_SOURCES)[number];

export const VALUATION_SOURCE_LABELS: Record<ValuationSource, string> = {
    user: 'User entered',
    appraisal: 'Professional appraisal',
    provider: 'Data provider',
    sample: 'Test data'
};

// ---------- building blocks ----------

// optional text: missing = leave alone, '' or null = clear it
function text(max: number, label: string) {
    return z
        .string()
        .trim()
        .max(max, `${label} must be ${max} characters or fewer`)
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v));
}

const cents = (label: string) =>
    z
        .number({ error: `${label} must be an amount in cents` })
        .int(`${label} must be whole cents`)
        .min(0, `${label} can't be negative`)
        .max(MAX_CENTS, `${label} looks too large`)
        .nullable()
        .optional();

const isoDate = (label: string) => z.iso.date({ error: `${label} must be a date (YYYY-MM-DD)` });

const detailsInput = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

// an estimate typed into the asset form. saved as a dated valuation observation
export const estimateInputSchema = z.object({
    valueType: z.enum(OBSERVED_VALUE_TYPES),
    amountCents: z.number().int().min(0).max(MAX_CENTS),
    observedAt: isoDate('Estimate date').optional()
});
export type EstimateInput = z.infer<typeof estimateInputSchema>;

// ---------- assets ----------

const assetFields = {
    brand: text(80, 'Brand'),
    model: text(120, 'Model'),
    location: text(80, 'Location'),
    condition: z.enum(CONDITIONS).nullable().optional(),
    purchaseDate: isoDate('Purchase date').nullable().optional(),
    purchasePriceCents: cents('Purchase price'),
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    serialNumber: text(80, 'Serial number'),
    insurance: z.enum(INSURANCE_STATUSES).nullable().optional(),
    insuranceNote: text(160, 'Insurance note'),
    notes: text(4000, 'Notes'),
    details: detailsInput.optional(),
    estimate: estimateInputSchema.nullable().optional()
};

export const assetCreateSchema = z.object({
    name: z.string().trim().min(1, 'Give it a name').max(120, 'Keep the name under 120 characters'),
    category: z.enum(CATEGORY_IDS, { error: 'Pick a category' }),
    ...assetFields
});
export type AssetCreateInput = z.input<typeof assetCreateSchema>;

export const assetPatchSchema = z.object({
    name: z.string().trim().min(1, 'Give it a name').max(120, 'Keep the name under 120 characters').optional(),
    category: z.enum(CATEGORY_IDS, { error: 'Pick a category' }).optional(),
    ...assetFields
});
export type AssetPatchInput = z.input<typeof assetPatchSchema>;

// ---------- valuations ----------

export const valuationCreateSchema = z
    .object({
        valueType: z.enum(OBSERVED_VALUE_TYPES, { error: 'Pick a value type' }),
        amountCents: cents('Amount'),
        lowCents: cents('Low estimate'),
        highCents: cents('High estimate'),
        currency: z.enum(SUPPORTED_CURRENCIES).optional(),
        observedAt: isoDate('Date'),
        source: z.enum(['user', 'appraisal', 'provider']).optional(),
        sourceName: text(80, 'Source name'),
        method: text(160, 'Method'),
        conditionAssumption: z.enum(CONDITIONS).nullable().optional(),
        notes: text(1000, 'Notes')
    })
    .superRefine((v, ctx) => {
        const hasAmount = v.amountCents != null;
        const hasLow = v.lowCents != null;
        const hasHigh = v.highCents != null;
        if (!hasAmount && !(hasLow && hasHigh)) {
            ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Enter an amount, or both ends of a range' });
        }
        if (hasLow !== hasHigh) {
            ctx.addIssue({ code: 'custom', path: [hasLow ? 'highCents' : 'lowCents'], message: 'A range needs both a low and a high' });
        }
        if (hasLow && hasHigh && v.lowCents! > v.highCents!) {
            ctx.addIssue({ code: 'custom', path: ['highCents'], message: 'The high end must be at least the low end' });
        }
    });
export type ValuationCreateInput = z.input<typeof valuationCreateSchema>;

// ---------- saved records (what the api returns) ----------

export interface AssetRecord {
    id: string;
    name: string;
    category: CategoryId;
    brand: string | null;
    model: string | null;
    location: string | null;
    condition: Condition | null;
    purchaseDate: string | null;
    purchasePriceCents: number | null;
    currency: Currency;
    serialNumber: string | null;
    insurance: InsuranceStatus | null;
    insuranceNote: string | null;
    notes: string | null;
    details: Details;
    isSample: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ValuationRecord {
    id: string;
    assetId: string;
    valueType: ObservedValueType;
    amountCents: number | null;
    lowCents: number | null;
    highCents: number | null;
    currency: Currency;
    observedAt: string;
    source: ValuationSource;
    sourceName: string | null;
    method: string | null;
    conditionAssumption: Condition | null;
    notes: string | null;
    createdAt: string;
}

export interface PortfolioResponse {
    assets: AssetRecord[];
    valuations: ValuationRecord[];
}

export interface AssetResponse {
    asset: AssetRecord;
    valuations: ValuationRecord[];
}

// ---------- lookups (suggestions are never saved without the user confirming) ----------

export const lookupSuggestionSchema = z.object({
    // 'brand', 'model', or 'details.<key>'
    field: z.string(),
    label: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    display: z.string()
});
export type LookupSuggestion = z.infer<typeof lookupSuggestionSchema>;

export interface VinLookupResult {
    provider: 'nhtsa_vpic';
    providerLabel: string;
    fetchedAt: string;
    vin: string;
    suggestions: LookupSuggestion[];
    specs: { label: string; value: string }[];
    warnings: string[];
}

export interface RecallItem {
    campaignNumber: string;
    reportedAt: string | null;
    component: string;
    summary: string;
    consequence: string;
    remedy: string;
    parkIt: boolean;
    parkOutside: boolean;
    overTheAir: boolean;
    url: string;
}

export interface RecallLookupResult {
    provider: 'nhtsa_recalls';
    providerLabel: string;
    fetchedAt: string;
    query: { make: string; model: string; year: number };
    recalls: RecallItem[];
}

export interface PropertyValueResult {
    provider: 'rentcast';
    providerLabel: string;
    fetchedAt: string;
    valueCents: number | null;
    lowCents: number | null;
    highCents: number | null;
    comparables: {
        address: string;
        priceCents: number | null;
        squareFeet: number | null;
        bedrooms: number | null;
        bathrooms: number | null;
        distanceMiles: number | null;
        status: string | null;
    }[];
    notes: string[];
}

// ---------- profile (filled in during onboarding) ----------

export const PURPOSES = ['insurance', 'net_worth', 'collecting', 'estate', 'moving', 'business', 'exploring'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
    insurance: 'Insurance inventory and claims',
    net_worth: 'Tracking what my things are worth',
    collecting: 'Managing a collection',
    estate: 'Estate or financial planning',
    moving: 'Moving, or splitting a household',
    business: 'Business equipment and assets',
    exploring: 'Just looking around'
};

// what onboarding says Gauge will do for each purpose
export const PURPOSE_HINTS: Record<Purpose, string> = {
    insurance: 'Serial numbers, receipts, and replacement costs in one claim-ready export.',
    net_worth: 'Fair market totals and value history, built from the values you record.',
    collecting: 'Grades, reference numbers, and price history for each piece.',
    estate: 'A dated inventory with values your family or advisor can actually use.',
    moving: 'A room-by-room list of what you own and what each item is worth.',
    business: 'Cost basis, condition, and service dates for tools and equipment.',
    exploring: 'Load the test portfolio to see every chart with real-looking data.'
};

export const profileInputSchema = z.object({
    name: z.string().trim().min(1, 'Tell us what to call you').max(80, 'Keep your name under 80 characters'),
    occupation: text(80, 'Occupation'),
    purpose: z.enum(PURPOSES, { error: 'Pick what brings you here' })
});
export type ProfileInput = z.input<typeof profileInputSchema>;

export interface ProfileRecord {
    name: string;
    occupation: string | null;
    purpose: Purpose;
    onboardedAt: string;
}

export interface ProfileResponse {
    profile: ProfileRecord | null;
}

// ---------- health / setup status ----------

export type ProviderStatus = 'ready' | 'needs_key' | 'planned';

export interface HealthResponse {
    ok: boolean;
    auth: { mode: 'clerk' | 'dev' | 'misconfigured'; message: string };
    database: { configured: boolean; connected: boolean; kind: 'local' | 'remote' | 'none'; message: string };
    providers: {
        id: string;
        label: string;
        covers: string;
        status: ProviderStatus;
        envVar: string | null;
        note: string;
    }[];
}
