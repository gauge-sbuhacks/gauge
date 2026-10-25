import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api.ts';
export function useMarketResearch(id: string) {
    const qc=useQueryClient();
    const key=['market-research',id] as const;
    const query=useQuery({ queryKey:key, queryFn:() => api.getMarketResearch(id) });
    const refresh=useMutation({ mutationFn:() => api.researchMarket(id), onSuccess:async data => {
        qc.setQueryData(key,data);
        await qc.invalidateQueries({queryKey:['asset-history',id]});
    } });
    return { ...query, refresh };
}
