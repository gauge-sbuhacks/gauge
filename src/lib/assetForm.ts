// the asset form's data: inputs are all strings (that's what text boxes hold), and these helpers
// turn them into the api payload and back. client-side checks mirror the server's, so most
// mistakes show up next to the field before anything is sent.

import { z } from 'zod';
import { detailsSchemaFor, getCategory, isCategoryId, isFieldVisible, type CategoryId, type Details } from '@shared/categories.ts';
import { centsToInput, parseMoneyInput } from '@shared/money.ts';
import type { AssetCreateInput, Condition, InsuranceStatus, ObservedValueType } from '@shared/schemas.ts';
import { todayIso } from './format.ts';
import type { PortfolioItem } from './portfolio.ts';

export interface AssetFormValues {
    name: string;
    category: CategoryId | '';
    brand: string;
    model: string;
    location: string;
    condition: Condition | '';
    purchaseDate: string;
    purchasePrice: string;
    serialNumber: string;
    insurance: InsuranceStatus | '';
    insuranceNote: string;
    notes: string;
    // every category field as a string; booleans are 'true' / 'false' / ''
    details: Record<string, string>;
    estimateType: ObservedValueType;
    estimateAmount: string;
    estimateDate: string;
}

export const DEFAULT_LOCATIONS = ['Home', 'Home office', 'Living room', 'Bedroom', 'Garage', 'Home safe', 'Storage unit', 'Office', 'Safe deposit box', 'Vehicle'];

export function emptyFormValues(): AssetFormValues {
    return {
        name: '',
        category: '',
        brand: '',
        model: '',
        location: '',
        condition: '',
        purchaseDate: '',
        purchasePrice: '',
        serialNumber: '',
        insurance: '',
        insuranceNote: '',
        notes: '',
        details: {},
        estimateType: 'fair_market',
        estimateAmount: '',
        estimateDate: todayIso()
    };
}

function detailToString(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
}

export function formValuesFromItem(item: PortfolioItem): AssetFormValues {
    const a = item.asset;
    const details: Record<string, string> = {};
    for (const [k, v] of Object.entries(a.details)) details[k] = detailToString(v);
    const latest = item.latest.fair_market;
    return {
        name: a.name,
        category: a.category,
        brand: a.brand ?? '',
        model: a.model ?? '',
        location: a.location ?? '',
        condition: a.condition ?? '',
        purchaseDate: a.purchaseDate ?? '',
        purchasePrice: centsToInput(a.purchasePriceCents),
        serialNumber: a.serialNumber ?? '',
        insurance: a.insurance ?? '',
        insuranceNote: a.insuranceNote ?? '',
        notes: a.notes ?? '',
        details,
        estimateType: 'fair_market',
        estimateAmount: latest?.amountCents != null ? centsToInput(latest.amountCents) : '',
        estimateDate: todayIso()
    };
}

// string inputs -> typed details for the chosen category (hidden fields are dropped)
export function toDetails(category: CategoryId, raw: Record<string, string>): Record<string, unknown> {
    const def = getCategory(category);
    const typed: Record<string, unknown> = {};
    // visibility depends on other typed values (like "kind"), so resolve selects first
    for (const f of def.fields) if (f.type === 'select') typed[f.key] = raw[f.key] && f.options?.some((o) => o.value === raw[f.key]) ? raw[f.key] : null;

    const out: Record<string, unknown> = {};
    for (const f of def.fields) {
        if (!isFieldVisible(f, typed as Details)) continue;
        const v = (raw[f.key] ?? '').trim();
        switch (f.type) {
            case 'select':
                out[f.key] = typed[f.key];
                break;
            case 'boolean':
                out[f.key] = v === 'true' ? true : v === 'false' ? false : null;
                break;
            case 'number':
            case 'integer':
                out[f.key] = v === '' ? null : Number(v.replace(/,/g, ''));
                break;
            default:
                out[f.key] = v === '' ? null : v;
        }
    }
    return out;
}

export function toPayload(values: AssetFormValues): AssetCreateInput {
    const category = values.category as CategoryId;
    const amount = parseMoneyInput(values.estimateAmount);
    const def = getCategory(category);
    return {
        name: values.name.trim(),
        category,
        // categories without brand/model (real estate) clear them
        brand: def.brandLabel ? values.brand.trim() || null : null,
        model: def.modelLabel ? values.model.trim() || null : null,
        location: values.location.trim() || null,
        condition: values.condition || null,
        purchaseDate: values.purchaseDate || null,
        purchasePriceCents: parseMoneyInput(values.purchasePrice) ?? null,
        serialNumber: values.serialNumber.trim() || null,
        insurance: values.insurance || null,
        insuranceNote: values.insuranceNote.trim() || null,
        notes: values.notes.trim() || null,
        details: toDetails(category, values.details) as Details,
        estimate: amount != null ? { valueType: values.estimateType, amountCents: amount, observedAt: values.estimateDate || todayIso() } : null
    };
}

// ---------- client-side validation ----------

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const assetFormSchema = z.custom<AssetFormValues>().superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: path.split('.'), message });

    if (!v.name.trim()) issue('name', 'Give it a name');
    else if (v.name.trim().length > 120) issue('name', 'Keep the name under 120 characters');

    if (!v.category || !isCategoryId(v.category)) issue('category', 'Pick a category');

    if (parseMoneyInput(v.purchasePrice) === undefined) issue('purchasePrice', 'Enter a dollar amount, like 1250 or 1,250.00');
    if (v.purchaseDate && !isDate(v.purchaseDate)) issue('purchaseDate', 'Enter a real date');
    else if (v.purchaseDate && v.purchaseDate > todayIso()) issue('purchaseDate', "The purchase date can't be in the future");

    const est = parseMoneyInput(v.estimateAmount);
    if (est === undefined) issue('estimateAmount', 'Enter a dollar amount, like 1250 or 1,250.00');
    if (est != null && (!v.estimateDate || !isDate(v.estimateDate))) issue('estimateDate', 'Add the date this value is from');
    else if (est != null && v.estimateDate > todayIso()) issue('estimateDate', "A value can't be dated in the future");

    if (v.category && isCategoryId(v.category)) {
        const result = detailsSchemaFor(v.category).safeParse(toDetails(v.category, v.details));
        if (!result.success) {
            for (const i of result.error.issues) issue(`details.${i.path.join('.')}`, i.message);
        }
    }
});

// server field names -> form field names, so api errors land on the right input
export function formFieldForServerKey(key: string): string {
    if (key === 'purchasePriceCents') return 'purchasePrice';
    if (key.startsWith('estimate.observedAt')) return 'estimateDate';
    if (key.startsWith('estimate')) return 'estimateAmount';
    return key;
}

// a friendly default name from what's been typed ("2020 Cadillac XT6")
export function suggestedName(values: AssetFormValues): string | null {
    if (!values.category) return null;
    const year = values.details.year?.trim();
    const parts = [values.category === 'vehicle' ? year : null, values.brand.trim(), values.model.trim()].filter(Boolean);
    if (values.category === 'property') return values.details.addressLine1?.trim() || null;
    return parts.length >= 2 || (parts.length === 1 && values.model.trim()) ? parts.join(' ') : null;
}
