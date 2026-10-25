// Same enrichIdentification pricing as photo capture: providers first, Gemini FMV only if still empty.

import type { CategoryId, Details } from '../../shared/categories.js';
import type { Condition, SuggestValuesResult } from '../../shared/schemas.js';
import type { SuggestedValue } from '../../shared/capture.js';
import { enrichIdentification } from './pipeline.js';

function mapValue(v: SuggestedValue | null) {
    return v?.amountCents ? { amountCents: v.amountCents, sourceName: v.sourceName, notes: v.notes } : null;
}

export async function suggestValuesForAsset(input: {
    category: CategoryId;
    name: string;
    brand?: string | null;
    model?: string | null;
    condition?: Condition | null;
    details?: Details;
}): Promise<SuggestValuesResult> {
    if (input.category === 'property') {
        return { fairMarket: null, quickSale: null, lookupMessage: 'Homes need an address before a value estimate.' };
    }
    const enriched = await enrichIdentification({
        category: input.category,
        name: input.name,
        brand: input.brand ?? null,
        model: input.model ?? null,
        serialNumber: null,
        condition: input.condition ?? null,
        confidence: 1,
        notes: null,
        details: input.details ?? {}
    });
    return {
        fairMarket: mapValue(enriched.suggestedValue),
        quickSale: mapValue(enriched.quickSale),
        lookupMessage: enriched.lookupMessage
    };
}
