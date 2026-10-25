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

// gemini often answers "overloaded" (503) or "too many requests" (429) for a moment. those are tried
// again after a short wait; anything else, or a third miss, gives up with a reason people can read
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_WAITS_MS = [1500, 4000];

// how long Google says to wait before the next request, in seconds (from a 429's RetryInfo)
async function retryAfterSeconds(res: Response): Promise<number | null> {
    try {
        const body = (await res.clone().json()) as { error?: { details?: { retryDelay?: string }[] } };
        const delay = body.error?.details?.find((d) => d.retryDelay)?.retryDelay;
        const seconds = delay ? Number.parseFloat(delay) : NaN;
        return Number.isFinite(seconds) ? seconds : null;
    } catch {
        return null;
    }
}

export function geminiProblem(status: number, retrySeconds: number | null = null): string {
    if (status === 429 && retrySeconds != null && retrySeconds > 120) {
        // the free tier's daily cap. it resets at midnight Pacific time; billing on the key's project lifts it
        const hours = Math.max(1, Math.round(retrySeconds / 3600));
        return `Gemini's daily request limit for this API key is used up (429). It resets in about ${hours} hour${hours === 1 ? '' : 's'}, or turn on billing for the key's Google project.`;
    }
    if (status === 429) return 'Gemini is getting too many requests (429). Wait a minute and try again.';
    if (status === 503 || status === 502 || status === 504 || status === 500) return `Gemini is overloaded right now (${status}). Try again in a moment.`;
    if (status === 400 || status === 401 || status === 403) return `Gemini turned the request down (${status}). Check the GEMINI_API_KEY.`;
    if (status === 404) return `The Gemini model "${geminiModel()}" was not found (404). Set GEMINI_MODEL to a current model.`;
    return `Gemini returned an error (${status}).`;
}

export class GeminiError extends Error {}

// the model for identifying photos and the price check. each model has its own free-tier daily limit,
// so GEMINI_MODEL can switch it without a code change (gemini-2.5-flash's free tier is 20 requests a day)
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function geminiModel(): string {
    const name = process.env.GEMINI_MODEL?.trim();
    return name && /^[a-z0-9][a-z0-9.-]*$/i.test(name) ? name : DEFAULT_GEMINI_MODEL;
}

// one generateContent call with the retries above. returns the response, ok or not
export async function fetchGemini(body: unknown, timeoutMs: number): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
            res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
                { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }
            );
        } catch (err) {
            const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
            throw new GeminiError(timedOut ? 'Gemini took too long to answer. Try again.' : 'Could not reach Gemini. Check the connection and try again.');
        }
        if (res.ok || !RETRY_STATUSES.has(res.status) || attempt >= RETRY_WAITS_MS.length) return res;
        // a used-up daily limit won't clear in a few seconds, so don't make people wait for nothing
        if (res.status === 429 && ((await retryAfterSeconds(res)) ?? 0) > 120) return res;
        await new Promise((resolve) => setTimeout(resolve, RETRY_WAITS_MS[attempt]));
    }
}

async function gemini(prompt: string, images: { mime: string; base64: string }[]): Promise<string> {
    const res = await fetchGemini(
        {
            contents: [
                {
                    parts: [{ text: prompt }, ...images.slice(0, 4).map((image) => ({ inline_data: { mime_type: image.mime, data: image.base64 } }))]
                }
            ],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        },
        25_000
    );
    if (!res.ok) throw new GeminiError(geminiProblem(res.status, await retryAfterSeconds(res)));
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
