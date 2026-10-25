import { CATEGORY_IDS, type CategoryId, type Details } from '../../shared/categories.js';
import type { IdentifiedItem } from '../../shared/capture.js';
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

export async function identifyPhotos(images: { mime: string; base64: string }[], multi: boolean): Promise<IdentifiedItem[]> {
    if (!geminiConfigured() || images.length === 0) return [];
    const prompt = multi
        ? 'These photos may show several belongings on a shelf or in a room. Return JSON {"items":[...]} with one object per distinct item. Categories: vehicle, property, watch, jewelry, collectible, electronics, household, equipment, other. Condition is new, excellent, good, fair, or poor. details may include vin, mileage, year, metal, purity, weightGrams, kind, setName, cardNumber, game (pokemon or magic), referenceNumber. Never invent a serial or VIN you cannot read. Use null when unknown.'
        : 'These photos are one belonging (front, a label or serial, and flaws). Return JSON {"items":[one object]}. Categories: vehicle, property, watch, jewelry, collectible, electronics, household, equipment, other. Condition is new, excellent, good, fair, or poor. details may include vin, mileage, year, metal, purity, weightGrams, kind, setName, cardNumber, game (pokemon or magic), referenceNumber. Never invent a serial or VIN you cannot read. Use null when unknown.';
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            ...images.slice(0, 4).map((image) => ({ inline_data: { mime_type: image.mime, data: image.base64 } }))
                        ]
                    }
                ],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
            }),
            signal: AbortSignal.timeout(25_000)
        }
    );
    if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return parseIdentifyJson(text);
}
