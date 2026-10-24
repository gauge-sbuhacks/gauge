// the signed-in person's onboarding profile. null data means onboarding isn't finished yet.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileInput } from '@shared/schemas.ts';
import { api } from '@/api/api.ts';

export const profileKey = ['profile'] as const;

export function useProfile({ enabled = true }: { enabled?: boolean } = {}) {
    return useQuery({ queryKey: profileKey, queryFn: api.getProfile, enabled, staleTime: Infinity });
}

export function useSaveProfile() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: ProfileInput) => api.saveProfile(input),
        onSuccess: (data) => qc.setQueryData(profileKey, data)
    });
}
