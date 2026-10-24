// the "test data" portfolio: ten made-up belongings with a few years of value history,
// so every chart and table has something to show. every asset is flagged isSample so
// "remove test data" deletes exactly these and never touches real entries.
// all amounts are invented for testing; they are not real quotes or appraisals.

import type { Details } from './categories.js';
import type { AssetCreateInput, ValuationCreateInput, ValuationSource } from './schemas.js';

export interface SampleValuation extends Omit<ValuationCreateInput, 'source'> {
    source: ValuationSource;
}

export interface SampleItem {
    asset: Omit<AssetCreateInput, 'estimate'> & { details: Details };
    valuations: SampleValuation[];
}

// ---------- date helpers (relative to today so the history never looks stale) ----------

function iso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function monthsAgo(today: Date, months: number): string {
    const d = new Date(today.getFullYear(), today.getMonth() - months, 1);
    // keep the day of month, clamped to the length of that month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(today.getDate(), lastDay));
    return iso(d);
}

function daysFromNow(today: Date, days: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
}

const dollars = (n: number) => Math.round(n * 100);

function fmv(today: Date, months: number, amount: number, extra: Partial<SampleValuation> = {}): SampleValuation {
    return { valueType: 'fair_market', amountCents: dollars(amount), observedAt: monthsAgo(today, months), source: 'sample', ...extra };
}

function repl(today: Date, months: number, amount: number, extra: Partial<SampleValuation> = {}): SampleValuation {
    return { valueType: 'replacement', amountCents: dollars(amount), observedAt: monthsAgo(today, months), source: 'sample', ...extra };
}

function liq(today: Date, months: number, amount: number, extra: Partial<SampleValuation> = {}): SampleValuation {
    return { valueType: 'liquidation', amountCents: dollars(amount), observedAt: monthsAgo(today, months), source: 'sample', ...extra };
}

// ---------- the portfolio ----------

export function buildSamplePortfolio(today = new Date()): SampleItem[] {
    return [
        {
            asset: {
                name: '2020 Cadillac XT6',
                category: 'vehicle',
                brand: 'Cadillac',
                model: 'XT6',
                location: 'Garage',
                condition: 'good',
                purchaseDate: '2020-09-12',
                purchasePriceCents: dollars(57_890),
                serialNumber: null,
                insurance: 'insured',
                insuranceNote: 'Auto policy',
                notes: 'VIN left blank on purpose. Add it (Edit) to try the free NHTSA decoder.',
                details: { year: 2020, trim: 'Premium Luxury', mileage: 61_240, exteriorColor: 'Stellar Black Metallic', titleStatus: 'clean' }
            },
            valuations: [
                fmv(today, 36, 39_800),
                fmv(today, 24, 34_600),
                fmv(today, 12, 31_200),
                fmv(today, 1, 28_400, { conditionAssumption: 'good', notes: 'Private party, about 61k miles' }),
                repl(today, 1, 31_900, { notes: 'Dealer retail for a similar 2020 XT6' }),
                liq(today, 1, 25_500, { notes: 'Dealer trade-in offer' })
            ]
        },
        {
            asset: {
                name: '89 Carnation Road',
                category: 'property',
                brand: null,
                model: null,
                location: null,
                condition: 'good',
                purchaseDate: '2019-06-28',
                purchasePriceCents: dollars(540_000),
                serialNumber: null,
                insurance: 'insured',
                insuranceNote: 'Homeowners HO-3',
                notes: 'Values here are made up. With a RentCast key, use "Get an estimate" under Lookups for a live one.',
                details: {
                    addressLine1: '89 Carnation Road',
                    city: 'Levittown',
                    state: 'NY',
                    postalCode: '11756',
                    propertyType: 'single_family',
                    squareFeet: 1_850,
                    bedrooms: 3,
                    bathrooms: 2,
                    yearBuilt: 1962
                }
            },
            valuations: [
                fmv(today, 47, 612_000),
                fmv(today, 35, 628_000),
                fmv(today, 23, 651_000),
                fmv(today, 11, 668_000),
                fmv(today, 1, 684_000),
                repl(today, 1, 455_000, { notes: 'Dwelling rebuild cost from the policy declarations page (excludes land)' })
            ]
        },
        {
            asset: {
                name: 'Rolex Submariner Date',
                category: 'watch',
                brand: 'Rolex',
                model: 'Submariner Date',
                location: 'Home safe',
                condition: 'excellent',
                purchaseDate: '2022-03-15',
                purchasePriceCents: dollars(10_250),
                serialNumber: null,
                insurance: 'scheduled',
                insuranceNote: 'Scheduled on the homeowners rider',
                notes: null,
                details: { referenceNumber: '126610LN', year: 2022, caseSizeMm: 41, movement: 'automatic', hasBox: true, hasPapers: true }
            },
            valuations: [
                fmv(today, 40, 13_900),
                fmv(today, 28, 13_100),
                fmv(today, 16, 12_800),
                fmv(today, 2, 12_900, { conditionAssumption: 'excellent', notes: 'Full set, box and papers' }),
                repl(today, 2, 13_500, { notes: 'Dealer price for the same reference' }),
                liq(today, 2, 11_600, { notes: 'Quick-sale offer' })
            ]
        },
        {
            asset: {
                name: 'Charizard Holo 4/102 (PSA 8)',
                category: 'collectible',
                brand: 'Pokémon TCG',
                model: 'Base Set',
                location: 'Home office',
                condition: 'excellent',
                purchaseDate: '2021-02-20',
                purchasePriceCents: dollars(2_850),
                serialNumber: null,
                insurance: null,
                insuranceNote: null,
                notes: 'Bought near the 2021 peak.',
                details: { kind: 'trading_card', setName: 'Base Set', cardNumber: '4/102', edition: 'Unlimited', grader: 'psa', grade: '8', year: 1999 }
            },
            valuations: [
                fmv(today, 42, 1_400),
                fmv(today, 30, 1_250),
                fmv(today, 18, 1_550),
                fmv(today, 3, 1_700),
                liq(today, 3, 1_450)
            ]
        },
        {
            asset: {
                name: 'MacBook Pro 14-inch',
                category: 'electronics',
                brand: 'Apple',
                model: 'MacBook Pro 14-inch (M3 Pro)',
                location: 'Home office',
                condition: 'excellent',
                purchaseDate: '2023-11-14',
                purchasePriceCents: dollars(2_399),
                serialNumber: 'SAMPLE-MBP-0423',
                insurance: 'insured',
                insuranceNote: 'Covered under homeowners',
                notes: null,
                details: { specs: '18GB memory, 512GB SSD', warrantyExpires: daysFromNow(today, 21) }
            },
            valuations: [
                fmv(today, 23, 1_700),
                fmv(today, 11, 1_350),
                fmv(today, 1, 1_150),
                repl(today, 1, 1_999, { notes: 'Current equivalent model at retail' })
            ]
        },
        {
            asset: {
                name: 'Fender American Professional II Stratocaster',
                category: 'household',
                brand: 'Fender',
                model: 'American Professional II Stratocaster',
                location: 'Living room',
                condition: 'good',
                purchaseDate: '2022-07-09',
                purchasePriceCents: dollars(1_699),
                serialNumber: 'SAMPLE-US22-0915',
                insurance: null,
                insuranceNote: null,
                notes: null,
                details: { kind: 'instrument', material: 'Alder body, maple neck', year: 2022 }
            },
            valuations: [fmv(today, 33, 1_250), fmv(today, 4, 1_200), repl(today, 4, 1_749)]
        },
        {
            asset: {
                name: 'American Gold Eagle 1 oz (x5)',
                category: 'jewelry',
                brand: 'U.S. Mint',
                model: 'American Gold Eagle 1 oz',
                location: 'Safe deposit box',
                condition: 'excellent',
                purchaseDate: '2020-04-08',
                purchasePriceCents: dollars(8_900),
                serialNumber: null,
                insurance: 'not_insured',
                insuranceNote: 'Bank safe deposit boxes are not insured by the bank',
                notes: null,
                details: { kind: 'coin', metal: 'gold', purity: '22k (.9167)', weightGrams: 155.5, quantity: 5 }
            },
            valuations: [
                fmv(today, 30, 11_900),
                fmv(today, 18, 15_800),
                fmv(today, 6, 20_400),
                fmv(today, 0, 21_250, { notes: 'Spot price x weight, test number' }),
                liq(today, 0, 20_300, { notes: 'Dealer bid' })
            ]
        },
        {
            asset: {
                name: 'Herman Miller Aeron Chair',
                category: 'household',
                brand: 'Herman Miller',
                model: 'Aeron (Size B)',
                location: 'Home office',
                condition: 'good',
                purchaseDate: '2021-01-18',
                purchasePriceCents: dollars(1_395),
                serialNumber: null,
                insurance: 'insured',
                insuranceNote: null,
                notes: null,
                details: { kind: 'furniture', material: 'Mesh, graphite frame' }
            },
            valuations: [fmv(today, 7, 650), repl(today, 7, 1_805)]
        },
        {
            asset: {
                name: 'DeWalt 20V MAX combo kit',
                category: 'equipment',
                brand: 'DeWalt',
                model: '20V MAX 5-tool combo kit',
                location: 'Garage',
                condition: 'good',
                purchaseDate: '2023-05-27',
                purchasePriceCents: dollars(599),
                serialNumber: null,
                insurance: null,
                insuranceNote: null,
                notes: 'No estimate yet, so it shows as Not entered.',
                details: { warrantyExpires: '2026-05-27' }
            },
            valuations: []
        },
        {
            asset: {
                name: 'Vintage Persian Heriz rug',
                category: 'household',
                brand: null,
                model: null,
                location: 'Living room',
                condition: 'fair',
                purchaseDate: null,
                purchasePriceCents: null,
                serialNumber: null,
                insurance: null,
                insuranceNote: null,
                notes: 'Inherited, so there is no purchase record.',
                details: { kind: 'rug', material: 'Hand-knotted wool', dimensions: '8 x 11 ft', year: 1950 }
            },
            valuations: [
                fmv(today, 25, 4_200, { source: 'appraisal', sourceName: 'Estate appraisal', conditionAssumption: 'fair' })
            ]
        }
    ];
}
