// the shapes that cross the wire: request schemas (zod) and saved-record types.
// on purpose there are separate schemas for "create", "partial update", and "lookup suggestion",
// because a half-finished edit and an uncertain suggestion have different rules than a saved record.

import { z } from 'zod';
import type { AssetPhoto } from './capture.js';
import { marketLocationSchema, type MarketLocation } from './marketplace.js';
import { CATEGORY_IDS, type CategoryId, type Details } from './categories.js';
import { MAX_CENTS, SUPPORTED_CURRENCIES, type Currency } from './money.js';
import type { VehicleValueUpdates } from './vehicleUpdates.js';

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

// value types we record as dated observations. cost basis comes from purchase info instead
export const OBSERVED_VALUE_TYPES = ['fair_market', 'liquidation'] as const;
export type ObservedValueType = (typeof OBSERVED_VALUE_TYPES)[number];

export const VALUE_TYPES = ['fair_market', 'liquidation', 'cost_basis'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
    fair_market: 'Fair market value',
    liquidation: 'Quick-sale value',
    cost_basis: 'Cost basis'
};

export const VALUE_TYPE_SHORT: Record<ValueType, string> = {
    fair_market: 'Fair market',
    liquidation: 'Quick sale',
    cost_basis: 'Cost basis'
};

export const VALUE_TYPE_HINTS: Record<ValueType, string> = {
    fair_market: 'What it would sell for between a willing buyer and seller',
    liquidation: 'Your recorded estimate for selling quickly',
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
    observedAt: isoDate('Estimate date').optional(),
    source: z.enum(['user', 'provider']).optional(),
    sourceName: text(80, 'Source name'),
    method: text(160, 'Method'),
    conditionAssumption: z.enum(CONDITIONS).nullish(),
    notes: text(1000, 'Notes'),
    monthlyVehicleUpdates: z.boolean().optional(),
    vehicleTrim: text(200, 'Vehicle trim')
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
        notes: text(1000, 'Notes'),
        monthlyVehicleUpdates: z.boolean().optional(),
        vehicleTrim: text(200, 'Vehicle trim')
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
    notes: string | null;
    details: Details;
    photos?: AssetPhoto[];
    isSample: boolean;
    vehicleValueUpdates?: VehicleValueUpdates | null;
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

export const vehicleValueQuerySchema = z.object({
    vin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^$|^[A-HJ-NPR-Z0-9]{17}$/, 'Use a full 17-character VIN, or leave it blank and enter year, make, and model')
        .nullish(),
    year: z.number().int().min(1886).max(new Date().getFullYear() + 2).nullish(),
    make: z.string().trim().max(80).nullish(),
    model: z.string().trim().max(120).nullish(),
    trim: z.string().trim().max(200).nullish(),
    mileage: z.number().int().min(0).max(2_000_000).nullish(),
    condition: z.enum(CONDITIONS).nullish(),
    titleStatus: z.string().nullish()
}).superRefine((q, ctx) => {
    if (q.vin) return;
    for (const field of ['year', 'make', 'model'] as const) {
        if (!q[field]) ctx.addIssue({ code: 'custom', path: [field], message: `Add the ${field}, or use a full VIN` });
    }
});
export type VehicleValueQuery = z.input<typeof vehicleValueQuerySchema>;

export interface VehicleMarketValue {
    valueCents: number;
    // the provider's "below market" and "above market" prices
    lowCents: number | null;
    highCents: number | null;
    // how many listings the estimate is based on, and the provider's confidence (0 to 100)
    sampleCount: number | null;
    certainty: number | null;
}

export const watchSearchQuerySchema = z.object({
    brand: z.string().trim().min(1, 'Pick the brand first'),
    reference: z.string().trim().min(3, 'Type at least 3 characters of the reference number')
});
export type WatchSearchQuery = z.input<typeof watchSearchQuerySchema>;

export interface WatchMatch {
    brand: string;
    referenceNumber: string;
    // without the brand in front ("Submariner Date", not "Rolex Submariner Date")
    model: string | null;
    movement: 'automatic' | 'manual' | 'quartz' | 'other' | null;
    caseSizeMm: number | null;
    caseMaterial: string | null;
    yearsProduced: string | null;
}

export interface WatchSearchResult {
    provider: 'thewatchapi';
    providerLabel: string;
    fetchedAt: string;
    matches: WatchMatch[];
}

export const watchValueQuerySchema = z.object({
    brand: z.string().trim().min(1, 'Add the brand first'),
    reference: z.string().trim().min(1, 'Add the reference number first'),
    model: z.string().trim().nullish(),
    condition: z.enum(CONDITIONS).nullish(),
    movement: z.string().trim().nullish(),
    caseSizeMm: z.number().nullish(),
    caseMaterial: z.string().trim().nullish(),
    year: z.number().int().nullish(),
    hasBox: z.boolean().nullish(),
    hasPapers: z.boolean().nullish()
});
export type WatchValueQuery = z.input<typeof watchValueQuerySchema>;

export interface WatchValueResult {
    provider: 'thewatchapi';
    providerLabel: string;
    fetchedAt: string;
    brand: string;
    reference: string;
    fairMarketCents: number | null;
    quickSaleCents: number | null;
    // "The Watch API asking prices" or "Price check", recorded with the value
    sourceName: string | null;
    method: string | null;
    notes: string[];
}

export interface VehicleValueResult {
    provider: 'vinaudit';
    providerLabel: string;
    fetchedAt: string;
    vehicle: string | null;
    mileage: number | null;
    // what dealers list similar cars for, and what a dealer would offer on a trade-in
    retail: VehicleMarketValue | null;
    tradeIn: VehicleMarketValue | null;
    period: { from: string; to: string } | null;
    // what the provider added or took off for mileage, condition, and title problems (retail)
    adjustments: { label: string; cents: number }[];
    notes: string[];
    // Only present for a lookup by year/make/model. IDs come from VinAudit, never synthesized.
    trimSelection?: { name: string; assumed: boolean; options: { id: string; name: string }[] };
}

export const CARD_GAMES = ['pokemon', 'magic'] as const;
export type CardGame = (typeof CARD_GAMES)[number];
export const CARD_GAME_LABELS: Record<CardGame, string> = { pokemon: 'Pokémon', magic: 'Magic: The Gathering' };

export const cardPriceQuerySchema = z.object({
    game: z.enum(CARD_GAMES, { error: 'Pick a game' }),
    name: z.string().trim().min(1, 'Enter the card name').max(120, 'Keep the card name under 120 characters'),
    setName: z.string().trim().max(120).nullish(),
    number: z.string().trim().max(20).nullish()
});
export type CardPriceQuery = z.input<typeof cardPriceQuerySchema>;

export interface CardPrice {
    // which printing the price is for: "Holofoil", "1st Edition holofoil", "Foil"
    label: string;
    currency: 'USD' | 'EUR';
    marketCents: number | null;
    lowCents: number | null;
    highCents: number | null;
    // the marketplace the number comes from (TCGplayer, Cardmarket)
    source: string;
}

export interface CardMatch {
    id: string;
    name: string;
    setName: string;
    number: string;
    rarity: string | null;
    imageUrl: string | null;
    url: string | null;
    // set and card number both match what the user entered
    exact: boolean;
    prices: CardPrice[];
}

export interface CardPriceResult {
    provider: 'tcgdex' | 'scryfall';
    providerLabel: string;
    fetchedAt: string;
    game: CardGame;
    matches: CardMatch[];
    notes: string[];
}

export const SPOT_METALS = ['gold', 'silver', 'platinum', 'palladium'] as const;
export type SpotMetal = (typeof SPOT_METALS)[number];

export const metalValueQuerySchema = z.object({
    metal: z.enum(SPOT_METALS, { error: 'Spot prices cover gold, silver, platinum, and palladium' }),
    weightGrams: z.number({ error: 'Add the total metal weight' }).positive('Add the total metal weight'),
    purity: z.string().trim().min(1, 'Add the purity')
});
export type MetalValueQuery = z.input<typeof metalValueQuerySchema>;

export interface MetalValueResult {
    provider: 'gold_api';
    providerLabel: string;
    fetchedAt: string;
    metal: SpotMetal;
    spotCentsPerOunce: number;
    spotUpdatedAt: string;
    weightGrams: number;
    purity: number;
    // troy ounces of pure metal
    fineOunces: number;
    meltValueCents: number;
    notes: string[];
}

// ---------- profile (filled in during onboarding) ----------

export const PURPOSES = ['selling', 'net_worth', 'collecting', 'estate', 'moving', 'business', 'exploring'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<Purpose, string> = {
    selling: 'Selling at a fair price',
    net_worth: 'Tracking what my things are worth',
    collecting: 'Managing a collection',
    estate: 'Estate or financial planning',
    moving: 'Moving, or splitting a household',
    business: 'Business equipment and assets',
    exploring: 'Just looking around'
};

// what onboarding says Gauge will do for each purpose
export const PURPOSE_HINTS: Record<Purpose, string> = {
    selling: 'Compare market evidence and prepare your items for sale.',
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
    marketLocation: marketLocationSchema.nullable().optional(),
    purpose: z.enum(PURPOSES, { error: 'Pick what brings you here' })
});
export type ProfileInput = z.input<typeof profileInputSchema>;

export interface ProfileRecord {
    marketLocation: MarketLocation | null;
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
