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
        'You are a deterministic US fair-market pricing function.',
        'Respond with JSON only: {"fairMarketCents": integer|null}.',
        'fairMarketCents = typical private-party fair market value in US cents today.',
        'Rules:',
        '- Use ONLY the facts block. Do not invent VIN, reference numbers, serials, certs, or purchase price.',
        '- If facts are too thin to price this category confidently, return {"fairMarketCents":null}.',
        '- Round to whole cents. No markdown, no extra keys, no quick-sale field.',
        '- category property: always {"fairMarketCents":null}.',
        '- category jewelry with metal, weightGrams, and purity: always {"fairMarketCents":null} (spot/melt is priced elsewhere).',
        '- category vehicle: need identifiable make/model or VIN in facts; respect mileage and condition when present.',
        '- category watch: use brand, model, referenceNumber in details when present.',
        '- category collectible with details.kind trading_card: use name, set, number, grade when present.',
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
