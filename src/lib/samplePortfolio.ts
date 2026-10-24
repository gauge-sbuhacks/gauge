// the test portfolio as PortfolioItems, built in the browser without the api.
// the landing page's diagrams use it so their numbers come from the same math as the real app.

import { buildSamplePortfolio } from '@shared/sampleData.ts';
import type { AssetRecord, ValuationRecord } from '@shared/schemas.ts';
import { buildPortfolio, type PortfolioItem } from './portfolio.ts';

export function samplePortfolioItems(today = new Date()): PortfolioItem[] {
    const now = today.toISOString();
    const assets: AssetRecord[] = [];
    const valuations: ValuationRecord[] = [];

    buildSamplePortfolio(today).forEach((item, i) => {
        const id = `sample-${i}`;
        const a = item.asset;
        assets.push({
            id,
            name: a.name,
            category: a.category,
            brand: a.brand ?? null,
            model: a.model ?? null,
            location: a.location ?? null,
            condition: a.condition ?? null,
            purchaseDate: a.purchaseDate ?? null,
            purchasePriceCents: a.purchasePriceCents ?? null,
            currency: 'USD',
            serialNumber: a.serialNumber ?? null,
            insurance: a.insurance ?? null,
            insuranceNote: a.insuranceNote ?? null,
            notes: a.notes ?? null,
            details: a.details,
            isSample: true,
            createdAt: now,
            updatedAt: now
        });
        item.valuations.forEach((v, j) => {
            valuations.push({
                id: `${id}-${j}`,
                assetId: id,
                valueType: v.valueType,
                amountCents: v.amountCents ?? null,
                lowCents: v.lowCents ?? null,
                highCents: v.highCents ?? null,
                currency: 'USD',
                observedAt: v.observedAt,
                source: v.source,
                sourceName: v.sourceName ?? null,
                method: v.method ?? null,
                conditionAssumption: v.conditionAssumption ?? null,
                notes: v.notes ?? null,
                createdAt: now
            });
        });
    });

    return buildPortfolio({ assets, valuations });
}
