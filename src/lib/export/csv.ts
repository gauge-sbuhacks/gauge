// csv export: one row per asset with its latest value of each type.
// empty cells mean "not entered". money is plain dollars (28400.00) so spreadsheets can sum it.

import { getCategory, isFieldVisible } from '@shared/categories.ts';
import { centsToInput, representativeCents } from '@shared/money.ts';
import { CONDITION_LABELS, VALUATION_SOURCE_LABELS, type ValuationRecord } from '@shared/schemas.ts';
import type { PortfolioItem } from '@/lib/portfolio.ts';
import { downloadBlob, exportFilename } from './download.ts';

// spreadsheet apps run cells that start with = + - @ as formulas. a leading ' keeps them as text
function safeText(s: string): string {
    return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(v: string | number | null | undefined): string {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v) : safeText(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dollars = (cents: number | null | undefined) => (cents == null ? null : (cents / 100).toFixed(2));

function valueCells(v: ValuationRecord | null): (string | null)[] {
    if (!v) return [null, null, null];
    const range = v.lowCents != null && v.highCents != null ? ` (range ${centsToInput(v.lowCents)} to ${centsToInput(v.highCents)})` : '';
    return [dollars(representativeCents(v)), v.observedAt, `${v.sourceName ?? VALUATION_SOURCE_LABELS[v.source]}${range}`];
}

export function detailsText(item: PortfolioItem): string {
    const { asset } = item;
    const parts: string[] = [];
    for (const f of getCategory(asset.category).fields) {
        if (!isFieldVisible(f, asset.details)) continue;
        const v = asset.details[f.key];
        if (v == null || v === '') continue;
        let shown: string;
        if (typeof v === 'boolean') shown = v ? 'Yes' : 'No';
        else if (f.type === 'select') shown = f.options?.find((o) => o.value === v)?.label ?? String(v);
        else shown = f.unit ? `${v} ${f.unit}` : String(v);
        parts.push(`${f.label}: ${shown}`);
    }
    return parts.join('; ');
}

export function buildCsv(items: PortfolioItem[]): string {
    const header = [
        'Name',
        'Category',
        'Brand or make',
        'Model',
        'Condition',
        'Location',
        'Identifier',
        'Serial number',
        'Purchase date',
        'Purchase price (USD)',
        'Fair market value (USD)',
        'Fair market as of',
        'Fair market source',
        'Quick-sale value (USD)',
        'Quick sale as of',
        'Quick sale source',
        'Record completeness',
        'Details',
        'Notes',
        'Test data'
    ];

    const rows = items.map((item) => {
        const { asset } = item;
        return [
            asset.name,
            item.category.label,
            asset.brand,
            asset.model,
            asset.condition ? CONDITION_LABELS[asset.condition] : null,
            asset.location,
            item.identifier ? `${item.identifier.label}: ${item.identifier.value}` : null,
            asset.serialNumber,
            asset.purchaseDate,
            dollars(asset.purchasePriceCents),
            ...valueCells(item.latest.fair_market),
            ...valueCells(item.latest.liquidation),
            `${item.done} of ${item.total}`,
            detailsText(item),
            asset.notes,
            asset.isSample ? 'Yes' : null
        ];
    });

    // BOM so excel opens it as utf-8 (names like "Pokémon" stay intact)
    return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(items: PortfolioItem[]) {
    downloadBlob(new Blob([buildCsv(items)], { type: 'text/csv;charset=utf-8' }), exportFilename('csv'));
}
