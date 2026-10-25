// asset categories and their category-specific fields.
// the form renders these progressively, the api validates against them, and the charts color by them.
// adding a category or a field here is all it takes; nothing else hardcodes the list.

import { z } from 'zod';

export const CATEGORY_IDS = [
    'vehicle',
    'property',
    'watch',
    'jewelry',
    'collectible',
    'electronics',
    'household',
    'equipment',
    'other'
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export type FieldType = 'text' | 'number' | 'integer' | 'date' | 'boolean' | 'select';

export interface FieldOption {
    value: string;
    label: string;
}

export interface CategoryField {
    key: string;
    label: string;
    type: FieldType;
    options?: FieldOption[];
    placeholder?: string;
    help?: string;
    unit?: string;
    min?: number;
    max?: number;
    maxLength?: number;
    // only show this field when another field has one of these values (progressive disclosure)
    showWhen?: { key: string; values: string[] };
    // counts as an identifier for "record completeness" (vin, reference number, cert number...)
    identifier?: boolean;
    // render in a monospace font (serials, vins)
    mono?: boolean;
    // uppercase the value before saving (vins)
    uppercase?: boolean;
    pattern?: { regex: string; message: string };
    // privacy-sensitive (home address). we never put these in urls or logs
    sensitive?: boolean;
    wide?: boolean;
}

// the general questions every asset gets, unless a category says they don't apply
export type CommonField = 'condition' | 'location' | 'serialNumber';

export interface CategoryDef {
    id: CategoryId;
    label: string;
    singular: string;
    hint: string;
    // categorical chart slot 1 to 8, null means the neutral "other" gray
    colorSlot: number | null;
    // labels for the shared brand/model inputs. null hides them (real estate has no brand)
    brandLabel: string | null;
    modelLabel: string | null;
    // general questions to leave out: a house has no "condition" grade, no shelf it sits on, and
    // its ID is the parcel number. a car's ID is its VIN, so a separate serial number would repeat it
    skips?: CommonField[];
    fields: CategoryField[];
}

const thisYear = new Date().getFullYear();

const graderOptions: FieldOption[] = [
    { value: 'psa', label: 'PSA' },
    { value: 'bgs', label: 'BGS (Beckett)' },
    { value: 'cgc', label: 'CGC' },
    { value: 'sgc', label: 'SGC' },
    { value: 'ngc', label: 'NGC' },
    { value: 'pcgs', label: 'PCGS' },
    { value: 'ungraded', label: 'Ungraded' }
];

const cardKinds = ['trading_card', 'sports_card'];
const gradedKinds = ['trading_card', 'sports_card', 'comic', 'coin'];

export const CATEGORIES: CategoryDef[] = [
    {
        id: 'vehicle',
        label: 'Vehicles',
        singular: 'Vehicle',
        hint: 'Cars, motorcycles, boats, trailers',
        colorSlot: 1,
        brandLabel: 'Make',
        modelLabel: 'Model',
        skips: ['serialNumber'],
        fields: [
            {
                key: 'vin',
                label: 'VIN (optional)',
                type: 'text',
                placeholder: '17 characters',
                help: 'Have your VIN? Decode it to autofill details. You can get an estimate without it.',
                identifier: true,
                mono: true,
                uppercase: true,
                maxLength: 17,
                pattern: { regex: '^[A-HJ-NPR-Z0-9]{5,17}$', message: 'VINs use letters and numbers only (no I, O, or Q)' }
            },
            { key: 'year', label: 'Year', type: 'integer', min: 1886, max: thisYear + 2, placeholder: String(thisYear) },
            { key: 'trim', label: 'Trim', type: 'text', placeholder: 'Leave blank if unsure', help: 'Optional, like SE or Premium Luxury. Unknown trims use a clearly labeled reference trim.' },
            { key: 'mileage', label: 'Mileage', type: 'integer', unit: 'mi', min: 0, max: 2_000_000, help: 'Current odometer reading. Market values depend on it.' },
            { key: 'purchaseMileage', label: 'Mileage when bought', type: 'integer', unit: 'mi', min: 0, max: 2_000_000, help: 'Used to work out what each mile has cost you.' },
            { key: 'exteriorColor', label: 'Color', type: 'text' },
            {
                key: 'titleStatus',
                label: 'Title',
                type: 'select',
                options: [
                    { value: 'clean', label: 'Clean' },
                    { value: 'lien', label: 'Has a lien / financed' },
                    { value: 'salvage', label: 'Salvage' },
                    { value: 'rebuilt', label: 'Rebuilt' }
                ]
            }
        ]
    },
    {
        id: 'property',
        label: 'Real estate',
        singular: 'Property',
        hint: 'Homes, condos, land',
        colorSlot: 2,
        brandLabel: null,
        modelLabel: null,
        skips: ['condition', 'location', 'serialNumber'],
        fields: [
            { key: 'addressLine1', label: 'Street address', type: 'text', placeholder: '89 Carnation Road', sensitive: true, wide: true },
            { key: 'city', label: 'City', type: 'text', sensitive: true },
            { key: 'state', label: 'State', type: 'text', placeholder: 'NY', maxLength: 30, sensitive: true },
            { key: 'postalCode', label: 'ZIP code', type: 'text', maxLength: 10, sensitive: true },
            {
                key: 'propertyType',
                label: 'Property type',
                type: 'select',
                options: [
                    { value: 'single_family', label: 'Single family' },
                    { value: 'condo', label: 'Condo' },
                    { value: 'townhouse', label: 'Townhouse' },
                    { value: 'multi_family', label: 'Multi family' },
                    { value: 'land', label: 'Land' },
                    { value: 'other', label: 'Other' }
                ]
            },
            { key: 'squareFeet', label: 'Living area', type: 'integer', unit: 'sq ft', min: 0, max: 1_000_000 },
            { key: 'bedrooms', label: 'Bedrooms', type: 'integer', min: 0, max: 100 },
            { key: 'bathrooms', label: 'Bathrooms', type: 'number', min: 0, max: 100 },
            { key: 'yearBuilt', label: 'Year built', type: 'integer', min: 1600, max: thisYear + 2 },
            { key: 'parcelNumber', label: 'Parcel number (APN)', type: 'text', identifier: true, mono: true }
        ]
    },
    {
        id: 'watch',
        label: 'Watches',
        singular: 'Watch',
        hint: 'Luxury and collectible watches',
        colorSlot: 3,
        brandLabel: 'Brand',
        modelLabel: 'Model',
        fields: [
            { key: 'referenceNumber', label: 'Reference number', type: 'text', placeholder: '126610LN', identifier: true, mono: true },
            { key: 'year', label: 'Year made', type: 'integer', min: 1700, max: thisYear + 1 },
            { key: 'caseSizeMm', label: 'Case size', type: 'number', unit: 'mm', min: 0, max: 100 },
            {
                key: 'movement',
                label: 'Movement',
                type: 'select',
                options: [
                    { value: 'automatic', label: 'Automatic' },
                    { value: 'manual', label: 'Manual wind' },
                    { value: 'quartz', label: 'Quartz' },
                    { value: 'other', label: 'Other' }
                ]
            },
            { key: 'hasBox', label: 'Original box', type: 'boolean' },
            { key: 'hasPapers', label: 'Papers / warranty card', type: 'boolean' },
            { key: 'lastServiced', label: 'Last serviced', type: 'date' }
        ]
    },
    {
        id: 'jewelry',
        label: 'Jewelry & metals',
        singular: 'Jewelry or metal',
        hint: 'Jewelry, gemstones, bullion, coins',
        colorSlot: 4,
        brandLabel: 'Maker or mint',
        modelLabel: 'Product',
        fields: [
            {
                key: 'kind',
                label: 'Type',
                type: 'select',
                options: [
                    { value: 'bullion', label: 'Bullion bar or round' },
                    { value: 'coin', label: 'Bullion coin' },
                    { value: 'jewelry', label: 'Jewelry' },
                    { value: 'gemstone', label: 'Loose gemstone' },
                    { value: 'other', label: 'Other' }
                ]
            },
            {
                key: 'metal',
                label: 'Metal',
                type: 'select',
                options: [
                    { value: 'gold', label: 'Gold' },
                    { value: 'silver', label: 'Silver' },
                    { value: 'platinum', label: 'Platinum' },
                    { value: 'palladium', label: 'Palladium' },
                    { value: 'other', label: 'Other' },
                    { value: 'none', label: 'None' }
                ]
            },
            { key: 'purity', label: 'Purity', type: 'text', placeholder: '.9999, 22k, 925' },
            {
                key: 'weightGrams',
                label: 'Total metal weight',
                type: 'number',
                unit: 'g',
                min: 0,
                max: 10_000_000,
                help: 'All pieces together, as weighed. Purity is applied separately.'
            },
            { key: 'quantity', label: 'Quantity', type: 'integer', min: 0, max: 1_000_000 },
            { key: 'gemstone', label: 'Gemstones', type: 'text', placeholder: '1.2ct diamond, VS1', showWhen: { key: 'kind', values: ['jewelry', 'gemstone'] } },
            { key: 'certificateNumber', label: 'Certificate or grading number', type: 'text', placeholder: 'GIA, NGC, PCGS', identifier: true, mono: true }
        ]
    },
    {
        id: 'collectible',
        label: 'Collectibles & art',
        singular: 'Collectible',
        hint: 'Trading cards, art, comics, memorabilia, vinyl',
        colorSlot: 5,
        brandLabel: 'Maker or publisher',
        modelLabel: 'Series or line',
        fields: [
            {
                key: 'kind',
                label: 'Type',
                type: 'select',
                options: [
                    { value: 'trading_card', label: 'Trading card' },
                    { value: 'sports_card', label: 'Sports card' },
                    { value: 'comic', label: 'Comic' },
                    { value: 'coin', label: 'Collectible coin' },
                    { value: 'art', label: 'Art' },
                    { value: 'memorabilia', label: 'Memorabilia' },
                    { value: 'vinyl', label: 'Vinyl record' },
                    { value: 'other', label: 'Other' }
                ]
            },
            { key: 'game', label: 'Card game', type: 'select', options: [{ value: 'pokemon', label: 'Pokémon' }, { value: 'magic', label: 'Magic: The Gathering' }], showWhen: { key: 'kind', values: ['trading_card'] } },
            { key: 'setCode', label: 'Magic set code', type: 'text', placeholder: 'LEA, MH3, EOE', maxLength: 8, showWhen: { key: 'game', values: ['magic'] }, help: 'The set code and collector number identify the exact printing for history.' },
            { key: 'finish', label: 'Finish', type: 'select', options: [{ value: 'normal', label: 'Nonfoil' }, { value: 'foil', label: 'Foil' }, { value: 'etched', label: 'Etched foil' }], showWhen: { key: 'game', values: ['magic'] } },
            { key: 'setName', label: 'Set', type: 'text', placeholder: 'Base Set', showWhen: { key: 'kind', values: cardKinds } },
            { key: 'cardNumber', label: 'Card number', type: 'text', placeholder: '4/102', mono: true, showWhen: { key: 'kind', values: cardKinds } },
            { key: 'edition', label: 'Edition or printing', type: 'text', placeholder: '1st Edition, Unlimited', showWhen: { key: 'kind', values: [...cardKinds, 'comic', 'vinyl'] } },
            { key: 'grader', label: 'Graded by', type: 'select', options: graderOptions, showWhen: { key: 'kind', values: gradedKinds } },
            { key: 'grade', label: 'Grade', type: 'text', placeholder: '10, 9.5, MS65', showWhen: { key: 'kind', values: gradedKinds } },
            { key: 'certNumber', label: 'Cert number', type: 'text', identifier: true, mono: true, showWhen: { key: 'kind', values: gradedKinds } },
            { key: 'artist', label: 'Artist', type: 'text', showWhen: { key: 'kind', values: ['art'] } },
            { key: 'medium', label: 'Medium', type: 'text', placeholder: 'Oil on canvas', showWhen: { key: 'kind', values: ['art'] } },
            { key: 'dimensions', label: 'Dimensions', type: 'text', placeholder: '24 x 36 in', showWhen: { key: 'kind', values: ['art', 'memorabilia'] } },
            { key: 'year', label: 'Year', type: 'integer', min: 1, max: thisYear + 1 },
            { key: 'provenance', label: 'Provenance', type: 'text', help: 'Where it came from, prior owners, receipts.', wide: true, maxLength: 500 }
        ]
    },
    {
        id: 'electronics',
        label: 'Electronics',
        singular: 'Electronics',
        hint: 'Computers, phones, cameras, TVs',
        colorSlot: 6,
        brandLabel: 'Brand',
        modelLabel: 'Model',
        fields: [
            { key: 'modelNumber', label: 'Model number', type: 'text', mono: true },
            { key: 'upc', label: 'Barcode (UPC / EAN)', type: 'text', mono: true, help: 'Barcode lookup is planned for a later phase.' },
            { key: 'specs', label: 'Key specs', type: 'text', placeholder: '18GB RAM, 1TB', wide: true },
            { key: 'warrantyExpires', label: 'Warranty expires', type: 'date' }
        ]
    },
    {
        id: 'household',
        label: 'Home & personal',
        singular: 'Home or personal item',
        hint: 'Furniture, rugs, instruments, appliances, clothing',
        colorSlot: 7,
        brandLabel: 'Brand or maker',
        modelLabel: 'Model or style',
        fields: [
            {
                key: 'kind',
                label: 'Type',
                type: 'select',
                options: [
                    { value: 'furniture', label: 'Furniture' },
                    { value: 'rug', label: 'Rug or textile' },
                    { value: 'instrument', label: 'Musical instrument' },
                    { value: 'appliance', label: 'Appliance' },
                    { value: 'clothing', label: 'Clothing or bags' },
                    { value: 'decor', label: 'Decor' },
                    { value: 'other', label: 'Other' }
                ]
            },
            { key: 'material', label: 'Material', type: 'text' },
            { key: 'dimensions', label: 'Dimensions', type: 'text' },
            { key: 'year', label: 'Year made', type: 'integer', min: 1, max: thisYear + 1 },
            { key: 'warrantyExpires', label: 'Warranty expires', type: 'date', showWhen: { key: 'kind', values: ['appliance', 'furniture', 'instrument'] } }
        ]
    },
    {
        id: 'equipment',
        label: 'Tools & equipment',
        singular: 'Tool or equipment',
        hint: 'Power tools, machinery, business equipment',
        colorSlot: 8,
        brandLabel: 'Manufacturer',
        modelLabel: 'Model',
        fields: [
            { key: 'modelNumber', label: 'Model number', type: 'text', mono: true },
            { key: 'assetTag', label: 'Asset tag', type: 'text', identifier: true, mono: true },
            { key: 'warrantyExpires', label: 'Warranty expires', type: 'date' },
            { key: 'lastServiced', label: 'Last serviced', type: 'date' },
            { key: 'serviceIntervalMonths', label: 'Service every', type: 'integer', unit: 'months', min: 1, max: 600 },
            { key: 'serviceNotes', label: 'Service notes', type: 'text', wide: true, maxLength: 500 }
        ]
    },
    {
        id: 'other',
        label: 'Other',
        singular: 'Other',
        hint: 'Anything that does not fit above',
        colorSlot: null,
        brandLabel: 'Brand',
        modelLabel: 'Model',
        fields: []
    }
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): CategoryDef {
    return byId.get(id as CategoryId) ?? byId.get('other')!;
}

// does this category ask the general question? ("condition", "location", "serialNumber")
export function usesCommonField(id: string, field: CommonField): boolean {
    return !(getCategory(id).skips ?? []).includes(field);
}

export function isCategoryId(id: string): id is CategoryId {
    return byId.has(id as CategoryId);
}

// is this field visible given the other detail values? (progressive disclosure)
export function isFieldVisible(field: CategoryField, details: Record<string, unknown>): boolean {
    if (!field.showWhen) return true;
    const current = details[field.showWhen.key];
    return typeof current === 'string' && field.showWhen.values.includes(current);
}

// ---------- validation ----------

export type DetailValue = string | number | boolean | null;
export type Details = Record<string, DetailValue>;

function fieldSchema(field: CategoryField) {
    switch (field.type) {
        case 'text': {
            let s = z.string().trim().max(field.maxLength ?? 200, `${field.label} is too long`);
            if (field.pattern) {
                const re = new RegExp(field.pattern.regex);
                s = s.refine((v) => v === '' || re.test(field.uppercase ? v.toUpperCase() : v), field.pattern.message);
            }
            return s
                .transform((v) => (field.uppercase ? v.toUpperCase() : v))
                .transform((v) => (v === '' ? null : v))
                .nullable()
                .optional();
        }
        case 'number': {
            let n = z.number({ error: `${field.label} must be a number` }).finite();
            if (field.min != null) n = n.min(field.min, `${field.label} must be at least ${field.min}`);
            if (field.max != null) n = n.max(field.max, `${field.label} must be at most ${field.max}`);
            return n.nullable().optional();
        }
        case 'integer': {
            let n = z.number({ error: `${field.label} must be a whole number` }).int(`${field.label} must be a whole number`);
            if (field.min != null) n = n.min(field.min, `${field.label} must be at least ${field.min}`);
            if (field.max != null) n = n.max(field.max, `${field.label} must be at most ${field.max}`);
            return n.nullable().optional();
        }
        case 'date':
            return z.iso.date({ error: `${field.label} must be a date` }).nullable().optional();
        case 'boolean':
            return z.boolean().nullable().optional();
        case 'select': {
            const values = (field.options ?? []).map((o) => o.value) as [string, ...string[]];
            return z.enum(values, { error: `Pick one of the ${field.label.toLowerCase()} options` }).nullable().optional();
        }
    }
}

const schemaCache = new Map<CategoryId, z.ZodType<Details>>();

// one zod object per category. unknown keys are dropped, so switching category never keeps stale fields
export function detailsSchemaFor(id: CategoryId): z.ZodType<Details> {
    const cached = schemaCache.get(id);
    if (cached) return cached;

    const shape: Record<string, z.ZodType> = {};
    for (const field of getCategory(id).fields) shape[field.key] = fieldSchema(field);
    const schema = z.object(shape).transform((obj) => {
        // drop undefined so the stored object stays tidy
        const out: Details = {};
        for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v as DetailValue;
        return out;
    }) as unknown as z.ZodType<Details>;
    schemaCache.set(id, schema);
    return schema;
}

// read the identifier-ish detail fields (vin, reference, cert...) for completeness and exports
export function identifierFields(id: CategoryId): CategoryField[] {
    return getCategory(id).fields.filter((f) => f.identifier);
}
