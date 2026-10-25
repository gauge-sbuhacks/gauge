import { CATEGORY_IDS, getCategory, isFieldVisible, usesCommonField, type CategoryField, type CategoryId, type Details } from '../../shared/categories.js';
import type { IdentifiedItem } from '../../shared/capture.js';
import { detailKeys, identityFields } from '../../shared/identity.js';
import { CONDITIONS, type Condition } from '../../shared/schemas.js';

export function geminiConfigured(): boolean {
    return !!process.env.GEMINI_API_KEY?.trim();
}

const CATEGORY_SET = new Set<string>(CATEGORY_IDS);
const CONDITION_SET = new Set<string>(CONDITIONS);

function asText(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s ? s.slice(0, max) : null;
}

function asDetails(raw: unknown): Details {
    if (!raw || typeof raw !== 'object') return {};
    const out: Details = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) out[key] = value.trim().slice(0, 200);
        else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
        else if (typeof value === 'boolean') out[key] = value;
    }
    return out;
}

export function parseIdentifyJson(raw: string): IdentifiedItem[] {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let data: unknown;
    try {
        data = JSON.parse(trimmed);
    } catch {
        return [];
    }
    const rows = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [data];
    const items: IdentifiedItem[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        if (typeof r.category === 'string' && !CATEGORY_SET.has(r.category)) continue;
        const category = typeof r.category === 'string' ? (r.category as CategoryId) : null;
        const condition = typeof r.condition === 'string' && CONDITION_SET.has(r.condition) ? (r.condition as Condition) : null;
        const confidence = typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : null;
        items.push({
            category,
            name: asText(r.name, 120),
            brand: asText(r.brand, 80),
            model: asText(r.model, 120),
            serialNumber: asText(r.serialNumber, 80),
            condition,
            confidence,
            notes: asText(r.notes, 400),
            details: asDetails(r.details)
        });
        if (items.length >= 12) break;
    }
    return items.filter((item) => item.name || item.brand || item.model || item.category);
}

const PRIVATE_KEYS = new Set(['vin', 'serialNumber', 'referenceNumber', 'certificateNumber', 'certNumber', 'parcelNumber', 'assetTag']);

function fieldLine(field: CategoryField): string {
    const options = field.options?.map((option) => option.value).join(', ');
    const when = field.showWhen ? ` Only when ${field.showWhen.key} is ${field.showWhen.values.join(' or ')}.` : '';
    return `- ${field.key} (${field.label}, ${field.type}${options ? `, one of: ${options}` : ''}).${when}`;
}

// the questions the second pass has to answer, in the same order as the add-asset form
export function questionPrompt(category: CategoryId): string {
    const def = getCategory(category);
    const identity: string[] = ['- name (what you would call it)'];
    for (const field of identityFields(category)) {
        if (field === 'brand') identity.push(`- brand (${def.brandLabel})`);
        else if (field === 'model') identity.push(`- model (${def.modelLabel})`);
        else {
            const found = def.fields.find((item) => item.key === field.slice('details.'.length));
            if (found) identity.push(fieldLine(found));
        }
    }
    const rest = detailKeys(category)
        .map((key) => def.fields.find((item) => item.key === key))
        .filter((field): field is CategoryField => !!field)
        .map(fieldLine);
    const condition = usesCommonField(category, 'condition') ? '\n- condition: new, excellent, good, fair, or poor' : '';
    const serial = usesCommonField(category, 'serialNumber') ? '\n- serialNumber: only the characters you can read, otherwise null' : '';
    return `What it is:\n${identity.join('\n')}${condition}${serial}${rest.length ? `\n\nThe rest:\n${rest.join('\n')}` : ''}`;
}

function coerceField(field: CategoryField, value: unknown): Details[string] | undefined {
    if (value == null || value === '') return undefined;
    if (field.type === 'boolean') {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const text = value.trim().toLowerCase();
            if (['true', 'yes', 'y'].includes(text)) return true;
            if (['false', 'no', 'n'].includes(text)) return false;
        }
        return undefined;
    }
    if (field.type === 'integer' || field.type === 'number') {
        const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
        if (!Number.isFinite(n)) return undefined;
        return field.type === 'integer' ? Math.round(n) : n;
    }
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const text = String(value).trim();
    if (!text) return undefined;
    if (field.type === 'select') {
        const match = field.options?.find((option) => option.value === text || option.value.toLowerCase() === text.toLowerCase() || option.label.toLowerCase() === text.toLowerCase());
        return match?.value;
    }
    return text.slice(0, field.maxLength ?? 200);
}

export function coerceFilledDetails(category: CategoryId, raw: Details): Details {
    const def = getCategory(category);
    const out: Details = {};
    for (const field of def.fields) {
        const value = coerceField(field, raw[field.key]);
        if (value !== undefined) out[field.key] = value;
    }
    for (const field of def.fields) {
        if (!isFieldVisible(field, out)) delete out[field.key];
    }
    return out;
}

export function parseCategoryJson(raw: string): { category: CategoryId | null; name: string | null }[] {
    return parseIdentifyJson(raw).map((item) => ({ category: item.category, name: item.name }));
}

export function parseFilledItem(category: CategoryId, raw: string, fallbackName: string | null): IdentifiedItem | null {
    const parsed = parseIdentifyJson(raw)[0];
    const source = parsed ?? blankFilled(raw);
    if (!source) return null;
    const details = coerceFilledDetails(category, { ...source.details });
    for (const key of Object.keys(details)) {
        if (PRIVATE_KEYS.has(key) && typeof details[key] === 'string' && String(details[key]).length < 3) delete details[key];
    }
    return {
        ...source,
        category,
        name: source.name || fallbackName,
        details
    };
}

function blankFilled(raw: string): IdentifiedItem | null {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        const data = JSON.parse(trimmed) as Record<string, unknown>;
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return {
            category: null,
            name: asText(data.name, 120),
            brand: asText(data.brand, 80),
            model: asText(data.model, 120),
            serialNumber: asText(data.serialNumber, 80),
            condition: typeof data.condition === 'string' && CONDITION_SET.has(data.condition) ? (data.condition as Condition) : null,
            confidence: null,
            notes: null,
            details: asDetails(data.details)
        };
    } catch {
        return null;
    }
}

async function gemini(prompt: string, images: { mime: string; base64: string }[]): Promise<string> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [{ text: prompt }, ...images.slice(0, 4).map((image) => ({ inline_data: { mime_type: image.mime, data: image.base64 } }))]
                    }
                ],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            }),
            signal: AbortSignal.timeout(25_000)
        }
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

export async function identifyPhotos(images: { mime: string; base64: string }[], multi: boolean): Promise<IdentifiedItem[]> {
    if (!geminiConfigured() || images.length === 0) return [];
    const categories = CATEGORY_IDS.join(', ');
    const first = multi
        ? `These photos may show several belongings. Return JSON {"items":[{"category","name"}]} with one object per distinct item. category must be one of: ${categories}. Choose the category only. Do not answer make, model, year, or any other question yet.`
        : `This photo is one belonging. Return JSON {"category","name"}. category must be one of: ${categories}. Choose the category only. Do not answer make, model, year, or any other question yet.`;
    const classified = parseCategoryJson(await gemini(first, images)).slice(0, multi ? 4 : 1);
    const items: IdentifiedItem[] = [];
    for (const row of classified) {
        if (!row.category) {
            if (row.name) items.push({ category: null, name: row.name, brand: null, model: null, serialNumber: null, condition: null, confidence: null, notes: null, details: {} });
            continue;
        }
        const second = `The category is already ${row.category} (${getCategory(row.category).label})${row.name ? `, tentatively "${row.name}"` : ''}. Answer every question below from the photos.
Return JSON {"name","brand","model","serialNumber","condition","details":{}}.
Fill recognizable facts such as make, model, and year. Use null when the photo does not show it.
Never invent a VIN, serial number, reference number, certificate, or parcel number you cannot read. Select answers must be one of the listed ids.

${questionPrompt(row.category)}`;
        const filled = parseFilledItem(row.category, await gemini(second, images), row.name);
        if (filled) items.push(filled);
    }
    return items;
}
