// the only file that calls fetch. every request goes through request(), which adds the
// clerk session token (when sign-in is on) and turns error responses into ApiError.

import type {
    AssetCreateInput,
    AssetPatchInput,
    AssetResponse,
    HealthResponse,
    PortfolioResponse,
    ProfileInput,
    ProfileResponse,
    PropertyValueResult,
    RecallLookupResult,
    ValuationCreateInput,
    ValuationRecord,
    VinLookupResult
} from '@shared/schemas.ts';

export class ApiError extends Error {
    status: number;
    code: string;
    fieldErrors: Record<string, string>;

    constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors;
    }
}

// ---------- auth token ----------

// AuthContext sets this. in dev mode it returns null and the api treats us as the local dev user
let getToken: () => Promise<string | null> = async () => null;

export function setTokenGetter(fn: () => Promise<string | null>) {
    getToken = fn;
}

// ---------- core ----------

// acceptStatus: error codes whose json body is still the answer (health returns 503 + details)
async function request<T>(method: string, path: string, body?: unknown, acceptStatus: number[] = []): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;

    let res: Response;
    try {
        res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
        throw new ApiError(0, 'network', "Couldn't reach the server. Check your connection and try again.");
    }

    if (res.status === 204) return undefined as T;

    let data: unknown = null;
    try {
        data = await res.json();
    } catch {
        // non-json error page (like a proxy error when the api isn't running)
    }

    if (!res.ok && !(acceptStatus.includes(res.status) && data)) {
        const d = (data ?? {}) as { error?: string; message?: string; fieldErrors?: Record<string, string> };
        const fallback = res.status === 502 || res.status === 504 ? "The API isn't responding. Is `npm run dev` running?" : `Request failed (${res.status}).`;
        throw new ApiError(res.status, d.error ?? 'error', d.message ?? fallback, d.fieldErrors ?? {});
    }
    return data as T;
}

// ---------- endpoints ----------

export const api = {
    health: () => request<HealthResponse>('GET', '/health', undefined, [503]),

    getProfile: () => request<ProfileResponse>('GET', '/profile'),
    saveProfile: (input: ProfileInput) => request<ProfileResponse>('PUT', '/profile', input),

    listAssets: () => request<PortfolioResponse>('GET', '/assets'),
    getAsset: (id: string) => request<AssetResponse>('GET', `/assets/${id}`),
    createAsset: (input: AssetCreateInput) => request<AssetResponse>('POST', '/assets', input),
    updateAsset: (id: string, input: AssetPatchInput) => request<AssetResponse>('PATCH', `/assets/${id}`, input),
    deleteAsset: (id: string) => request<void>('DELETE', `/assets/${id}`),

    addValuation: (assetId: string, input: ValuationCreateInput) =>
        request<{ valuation: ValuationRecord }>('POST', `/assets/${assetId}/valuations`, input),
    deleteValuation: (assetId: string, valuationId: string) => request<void>('DELETE', `/assets/${assetId}/valuations/${valuationId}`),

    loadSample: () => request<{ added: number; valuations: number }>('POST', '/sample'),
    removeSample: () => request<{ removed: number }>('DELETE', '/sample'),

    decodeVin: (vin: string) => request<VinLookupResult>('POST', '/lookups/vin', { vin }),
    recalls: (q: { make: string; model: string; year: number }) => request<RecallLookupResult>('POST', '/lookups/recalls', q),
    propertyValue: (q: {
        addressLine1: string;
        city: string;
        state: string;
        postalCode?: string | null;
        propertyType?: string | null;
        bedrooms?: number | null;
        bathrooms?: number | null;
        squareFeet?: number | null;
    }) => request<PropertyValueResult>('POST', '/lookups/property-value', q)
};
