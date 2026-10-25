import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api.ts';

export function useAssetHistory(id: string) {
    const qc = useQueryClient();
    const key = ['asset-history', id] as const;
    // Reading a page only reads saved history. Provider calls require the load button.
    const query = useQuery({ queryKey: key, queryFn: () => api.getAssetHistory(id), staleTime: 60_000 });
    const refresh = useMutation({ mutationFn: () => api.refreshAssetHistory(id), onSuccess: data => qc.setQueryData(key, data) });
    return { ...query, refresh };
}
