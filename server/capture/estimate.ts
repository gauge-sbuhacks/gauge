// Gemini fair-market fallback only when no provider returned FMV. No photo; temperature 0.

import type { CategoryId } from '../../shared/categories.js';
import type { IdentifiedItem } from '../../shared/capture.js';
import { geminiConfigured } from './identify.js';

export interface PriceGuess {
    fairMarketCents: number | null;
    quickSaleCents: number | null;
}

function cents(value: unknown): number | null {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
}

export function parsePriceJson(raw: string): PriceGuess {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
        const data = JSON.parse(trimmed) as { fairMarketCents?: unknown; quickSaleCents?: unknown };
        return { fairMarketCents: cents(data.fairMarketCents), quickSaleCents: null };
    } catch {
        return { fairMarketCents: null, quickSaleCents: null };
    }
}

function hasMeltInputs(details: IdentifiedItem['details']): boolean {
    const metal = details.metal;
    const weight = typeof details.weightGrams === 'number' ? details.weightGrams : null;
    const purity = typeof details.purity === 'string' ? details.purity.trim() : '';
    return (metal === 'gold' || metal === 'silver' || metal === 'platinum' || metal === 'palladium') && weight != null && weight > 0 && purity.length > 0;
}

function priceCheckPrompt(item: IdentifiedItem): string {
    const category = (item.category ?? 'other') as CategoryId;
    const facts = JSON.stringify(
        {
            category,
            name: item.name,
            brand: item.brand,
            model: item.model,
            condition: item.condition,
            details: item.details
        },
        null,
        0
    );

    return [
        'You are a deterministic US private-party pricing function.',
        'Respond with JSON only: {"fairMarketCents": integer}.',
        'fairMarketCents is the typical US private-party price today, in whole cents.',
        'Use the facts. Brand and model are enough. A missing reference number, VIN, or serial must not make you return null.',
        'Return {"fairMarketCents":null} only when category is property, or when name, brand, and model are all empty.',
        'For a watch, price the brand and model named in the facts (example: Seiko + 5 Sport).',
        'Do not invent a purchase price. No markdown. No extra keys.',
        'Facts:',
        facts
    ].join('\n');
}

export async function estimatePrices(item: IdentifiedItem): Promise<PriceGuess | null> {
    if (!geminiConfigured()) return null;
    if (item.category === 'property') return null;
    if (item.category === 'jewelry' && hasMeltInputs(item.details)) return null;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: priceCheckPrompt(item) }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0,
                    topP: 1,
                    topK: 1,
                    responseSchema: {
                        type: 'object',
                        properties: {
                            fairMarketCents: { type: 'integer', nullable: true }
                        },
                        required: ['fairMarketCents']
                    }
                }
            }),
            signal: AbortSignal.timeout(15_000)
        }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return parsePriceJson(text);
}
