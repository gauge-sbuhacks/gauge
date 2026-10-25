import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaptureApproval, CaptureMode } from '@shared/capture.ts';
import { api } from '@/api/api.ts';
import { portfolioKey } from '@/hooks/usePortfolio.ts';

export function useCaptureDesk(assetId: string | undefined, live: boolean, initialSessionId: string | null = null) {
    const qc = useQueryClient();
    const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
    const [token, setToken] = useState<string | null>(null);

    const create = useMutation({
        mutationFn: (mode: CaptureMode) => api.createCaptureSession({ mode, assetId }),
        onSuccess: (data) => {
            setSessionId(data.id);
            setToken(data.token ?? null);
            qc.setQueryData(['capture-session', data.id], data);
        }
    });

    const session = useQuery({
        queryKey: ['capture-session', sessionId],
        queryFn: () => api.getCaptureSession(sessionId!),
        enabled: !!sessionId,
        refetchInterval: live && sessionId ? 1000 : false
    });

    const revoke = useMutation({
        mutationFn: () => api.revokeCaptureSession(sessionId!),
        onSuccess: (data) => qc.setQueryData(['capture-session', sessionId], data)
    });

    const confirm = useMutation({
        mutationFn: (input: string | { draftId: string; approval: CaptureApproval }) =>
            typeof input === 'string' ? api.confirmCaptureDraft(sessionId!, input) : api.confirmCaptureDraft(sessionId!, input.draftId, input.approval),
        onSuccess: async (data) => {
            qc.setQueryData(['capture-session', sessionId], data.session);
            await qc.invalidateQueries({ queryKey: portfolioKey });
        }
    });

    const discard = useMutation({
        mutationFn: (draftId: string) => api.discardCaptureDraft(sessionId!, draftId),
        onSuccess: (data) => qc.setQueryData(['capture-session', sessionId], data)
    });

    // identify the same photos again (Gemini was busy the first time)
    const identify = useMutation({
        mutationFn: (draftId: string) => api.identifyCaptureDraft(sessionId!, draftId),
        onSuccess: (data) => qc.setQueryData(['capture-session', sessionId], data)
    });

    return { create, session, token, sessionId, revoke, confirm, discard, identify };
}

export function usePhoneCapture(token: string | undefined) {
    return useQuery({
        queryKey: ['phone-capture', token],
        queryFn: () => api.phoneCapture(token!),
        enabled: !!token,
        refetchInterval: 5000
    });
}
