// when no provider returned a fair market value. one short text call, no photo,
// using the details that were already filled in (temperature 0 for a stable guess).

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
        return { fairMarketCents: cents(data.fairMarketCents), quickSaleCents: cents(data.quickSaleCents) };
    } catch {
        return { fairMarketCents: null, quickSaleCents: null };
    }
}

export async function estimatePrices(item: IdentifiedItem): Promise<PriceGuess | null> {
    if (!geminiConfigured()) return null;
    const facts = {
        category: item.category,
        name: item.name,
        brand: item.brand,
        model: item.model,
        condition: item.condition,
        details: item.details
    };
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY!.trim())}`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `Price this belonging in US cents. fairMarketCents is a typical private-party price today. quickSaleCents is what a dealer or a fast buyer would pay, and it must be lower. Use only these details:\n${JSON.stringify(facts)}\nReturn JSON {"fairMarketCents","quickSaleCents"}. Use null if you cannot price it. Do not include a purchase price.`
                            }
                        ]
                    }
                ],
                generationConfig: { responseMimeType: 'application/json', temperature: 0 }
            }),
            signal: AbortSignal.timeout(15_000)
        }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    const guess = parsePriceJson(text);
    if (guess.fairMarketCents != null && guess.quickSaleCents != null && guess.quickSaleCents > guess.fairMarketCents) {
        return { fairMarketCents: guess.fairMarketCents, quickSaleCents: guess.fairMarketCents };
    }
    return guess;
}
