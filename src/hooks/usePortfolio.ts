// tanstack query hooks. the whole portfolio is one query (assets + every observation),
// and every mutation refreshes it, so all pages always agree on the numbers.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetCreateInput, AssetPatchInput, ObservedValueType, ValuationCreateInput } from '@shared/schemas.ts';
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
    return () => Promise.all([qc.invalidateQueries({ queryKey: portfolioKey }),qc.invalidateQueries({ queryKey: ['market-research'] }), qc.invalidateQueries({ queryKey: ['asset-history'] })]);
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

export function useVehicleUpdates(assetId: string) {
    const refresh = useRefresh();
    const settings = useMutation({ mutationFn: (types: ObservedValueType[]) => api.setVehicleUpdates(assetId, types), onSuccess: refresh });
    const updateNow = useMutation({ mutationFn: () => api.refreshVehicleValues(assetId), onSettled: refresh });
    return { settings, updateNow };
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

// ---------- lookups ----------
// lookups don't change saved data, so nothing to refresh. the same lookup with the same inputs reuses
// its answer for 10 minutes instead of asking the provider again, so repeat presses and double clicks
// don't spend quota (RentCast's free plan is 50 a month). a failed lookup isn't kept, so retrying works.

const REMEMBER_MS = 10 * 60_000;
const recentLookups = new Map<string, { at: number; result: Promise<unknown> }>();

function remembered<Q, R>(name: string, fn: (q: Q) => Promise<R>): (q: Q) => Promise<R> {
    return (q) => {
        const key = `${name}:${JSON.stringify(q)}`;
        const hit = recentLookups.get(key);
        if (hit && Date.now() - hit.at < REMEMBER_MS) return hit.result as Promise<R>;
        if (recentLookups.size >= 100) recentLookups.delete(recentLookups.keys().next().value!);
        const result = fn(q);
        recentLookups.set(key, { at: Date.now(), result });
        result.catch(() => recentLookups.delete(key));
        return result;
    };
}

const lookupFns = {
    vin: remembered('vin', api.decodeVin),
    recalls: remembered('recalls', api.recalls),
    property: remembered('property', api.propertyValue),
    vehicle: remembered('vehicle', api.vehicleValue),
    cards: remembered('cards', api.cardPrices),
    metal: remembered('metal', api.metalValue),
    suggest: remembered('suggest', api.suggestValues),
    watchSearch: remembered('watchSearch', api.watchSearch),
    watchValue: remembered('watchValue', api.watchValue)
};

export function useVinLookup() {
    return useMutation({ mutationFn: lookupFns.vin });
}

export function useRecallLookup() {
    return useMutation({ mutationFn: lookupFns.recalls });
}

export function usePropertyValueLookup() {
    return useMutation({ mutationFn: lookupFns.property });
}

export function useVehicleValueLookup() {
    return useMutation({ mutationFn: lookupFns.vehicle });
}

export function useCardPriceLookup() {
    return useMutation({ mutationFn: lookupFns.cards });
}

export function useMetalValueLookup() {
    return useMutation({ mutationFn: lookupFns.metal });
}

export function useSuggestValues() {
    return useMutation({ mutationFn: lookupFns.suggest });
}

export function useWatchSearchLookup() {
    return useMutation({ mutationFn: lookupFns.watchSearch });
}

export function useWatchValueLookup() {
    return useMutation({ mutationFn: lookupFns.watchValue });
}
