// what a vehicle has lost since it was bought, and a projection of where it's heading.
// everything comes from what was recorded (purchase price and date, mileage, the latest fair
// market value); nothing is looked up. the projection is a curve, not a valuation, and the ui
// labels it that way.

import { representativeCents } from '@shared/money.ts';
import { daysBetween } from './format.ts';
import type { PortfolioItem } from './portfolio.ts';

const DAYS_PER_YEAR = 365.25;
// under half a year, one valuation swings the rates too much to be useful
const MIN_YEARS_FOR_RATES = 0.5;
// the car's own rate needs a full year of history before we project with it
const MIN_YEARS_FOR_OWN_PROJECTION = 1;
const PROJECTION_YEARS = 5;

export interface ProjectionPoint {
    date: string;
    valueCents: number;
}

export interface Depreciation {
    purchaseCents: number;
    purchaseDate: string;
    currentCents: number;
    currentDate: string;
    // negative means it lost value
    changeCents: number;
    changeRatio: number;
    years: number;
    // average value lost per year, straight line. null when the history is too short
    lossPerYearCents: number | null;
    // compounded yearly loss: 0.12 means it loses 12% of its value each year
    annualRate: number | null;
    milesDriven: number | null;
    lossPerMileCents: number | null;
    projection: ProjectionPoint[];
    projectionRate: number;
    // 'own' = the rate this car has averaged; 'typical' = a rule of thumb for a car its age
    projectionBasis: 'own' | 'typical';
}

export type DepreciationResult = { status: 'ok'; value: Depreciation } | { status: 'missing'; missing: string[] };

// common rule of thumb: about 20% in the first year, around 15% a year through year five, slower after
function typicalRate(modelYear: number | null, onDate: string): number {
    if (modelYear == null) return 0.15;
    const age = Number(onDate.slice(0, 4)) - modelYear;
    if (age <= 1) return 0.2;
    if (age <= 5) return 0.15;
    return 0.1;
}

function addYears(iso: string, years: number): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    // feb 29 doesn't exist most years
    const day = m === '02' && d === '29' ? '28' : d;
    return `${Number(y) + years}-${m}-${day}`;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function vehicleDepreciation(item: PortfolioItem): DepreciationResult {
    const { asset } = item;
    const latest = item.latest.fair_market;
    const currentCents = latest ? representativeCents(latest) : null;

    const missing: string[] = [];
    if (asset.purchasePriceCents == null || asset.purchasePriceCents <= 0) missing.push('purchase price');
    if (!asset.purchaseDate) missing.push('purchase date');
    if (currentCents == null || !latest) missing.push('a fair market value');
    if (missing.length > 0) return { status: 'missing', missing };

    const purchaseCents = asset.purchasePriceCents!;
    const purchaseDate = asset.purchaseDate!;
    const currentDate = latest!.observedAt;
    const years = daysBetween(purchaseDate, currentDate) / DAYS_PER_YEAR;
    if (years <= 0) return { status: 'missing', missing: ['a fair market value dated after the purchase'] };

    const changeCents = currentCents! - purchaseCents;
    const hasRates = years >= MIN_YEARS_FOR_RATES && currentCents! > 0;
    const annualRate = hasRates ? 1 - Math.pow(currentCents! / purchaseCents, 1 / years) : null;

    const mileage = num(asset.details.mileage);
    const purchaseMileage = num(asset.details.purchaseMileage);
    const milesDriven = mileage != null && purchaseMileage != null && mileage > purchaseMileage ? mileage - purchaseMileage : null;

    // a car that went up in value (2021-22 shortages) or crashed oddly isn't a curve to extend
    const ownRateUsable = annualRate != null && years >= MIN_YEARS_FOR_OWN_PROJECTION && annualRate > 0.01 && annualRate < 0.5;
    const projectionRate = ownRateUsable ? annualRate! : typicalRate(num(asset.details.year), currentDate);

    const projection: ProjectionPoint[] = [];
    for (let t = 1; t <= PROJECTION_YEARS; t++) {
        projection.push({ date: addYears(currentDate, t), valueCents: Math.round(currentCents! * Math.pow(1 - projectionRate, t)) });
    }

    return {
        status: 'ok',
        value: {
            purchaseCents,
            purchaseDate,
            currentCents: currentCents!,
            currentDate,
            changeCents,
            changeRatio: changeCents / purchaseCents,
            years,
            lossPerYearCents: hasRates ? Math.round(-changeCents / years) : null,
            annualRate,
            milesDriven,
            lossPerMileCents: milesDriven != null ? -changeCents / milesDriven : null,
            projection,
            projectionRate,
            projectionBasis: ownRateUsable ? 'own' : 'typical'
        }
    };
}
