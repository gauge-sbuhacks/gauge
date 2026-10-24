// tanstack query hooks. the whole portfolio is one query (assets + every observation),
// and every mutation refreshes it, so all pages always agree on the numbers.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetCreateInput, AssetPatchInput, ValuationCreateInput } from '@shared/schemas.ts';
import { api } from '@/api/api.ts';
import { buildPortfolio, type PortfolioItem } from '@/lib/portfolio.ts';

export const portfolioKey = ['portfolio'] as const;
export const healthKey = ['health'] as const;

export function usePortfolio() {
    const query = useQuery({ queryKey: portfolioKey, queryFn: api.listAssets });
    const items = useMemo<PortfolioItem[] | null>(() => (query.data ? buildPortfolio(query.data) : null), [query.data]);
    return { ...query, items };
}

export function useAssetItem(id: string | undefined) {
    const portfolio = usePortfolio();
    const item = useMemo(() => portfolio.items?.find((i) => i.asset.id === id) ?? null, [portfolio.items, id]);
    return { ...portfolio, item };
}

export function useHealth() {
    return useQuery({ queryKey: healthKey, queryFn: api.health, staleTime: 30_000 });
}

function useRefresh() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: portfolioKey });
}

export function useCreateAsset() {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (input: AssetCreateInput) => api.createAsset(input), onSuccess: refresh });
}

export function useUpdateAsset(id: string) {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (input: AssetPatchInput) => api.updateAsset(id, input), onSuccess: refresh });
}

export function useDeleteAsset() {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (id: string) => api.deleteAsset(id), onSuccess: refresh });
}

export function useAddValuation(assetId: string) {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (input: ValuationCreateInput) => api.addValuation(assetId, input), onSuccess: refresh });
}

export function useDeleteValuation(assetId: string) {
    const refresh = useRefresh();
    return useMutation({ mutationFn: (valuationId: string) => api.deleteValuation(assetId, valuationId), onSuccess: refresh });
}

export function useLoadSample() {
    const refresh = useRefresh();
    return useMutation({ mutationFn: api.loadSample, onSuccess: refresh });
}

export function useRemoveSample() {
    const refresh = useRefresh();
    return useMutation({ mutationFn: api.removeSample, onSuccess: refresh });
}

// lookups don't change saved data, so nothing to refresh
export function useVinLookup() {
    return useMutation({ mutationFn: api.decodeVin });
}

export function useRecallLookup() {
    return useMutation({ mutationFn: api.recalls });
}

export function usePropertyValueLookup() {
    return useMutation({ mutationFn: api.propertyValue });
}
