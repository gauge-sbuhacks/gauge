import type { CategoryId } from '@shared/categories.ts';
import type { SuggestValuesQuery } from '@shared/schemas.ts';
import { toDetails, type AssetFormValues } from './assetForm.ts';

export function suggestQueryFromForm(values: AssetFormValues): SuggestValuesQuery | null {
    if (!values.category || values.category === 'property') return null;
    const category = values.category as CategoryId;
    if (!values.name.trim()) return null;
    return {
        category,
        name: values.name.trim(),
        brand: values.brand.trim() || null,
        model: values.model.trim() || null,
        condition: values.condition || null,
        details: toDetails(category, values.details) as SuggestValuesQuery['details']
    };
}
