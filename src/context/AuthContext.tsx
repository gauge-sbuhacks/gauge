// who is signed in. two modes:
//   - clerk: VITE_CLERK_PUBLISHABLE_KEY is set. visitors start signed out and use /sign-in or /sign-up
//   - dev: no key, so the app runs as the "local dev user" (the api does the same)
// either way, components call useAuthInfo() and don't care which mode it is. the router decides
// what a signed-out visitor sees (see AppGate), so this file never renders a page itself.

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { setTokenGetter } from '@/api/api.ts';
import { CLERK_PUBLISHABLE_KEY } from '@/config.ts';
import { clerkAppearance } from '@/lib/clerkAppearance.ts';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthInfo {
    mode: 'clerk' | 'dev';
    status: AuthStatus;
    displayName: string;
    // used to prefill onboarding
    suggestedName: string | null;
    email: string | null;
    signOut: (() => Promise<void>) | null;
}

const AuthContext = createContext<AuthInfo | null>(null);

export function useAuthInfo(): AuthInfo {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuthInfo() has to be used inside <AuthProvider>');
    return ctx;
}

// clerk's components navigate through these so moving between /sign-in and /sign-up doesn't reload the page
export type Navigate = (to: string, opts?: { replace?: boolean }) => unknown;

export function AuthProvider({ children, navigate }: { children: ReactNode; navigate: Navigate }) {
    if (!CLERK_PUBLISHABLE_KEY) return <DevAuth>{children}</DevAuth>;
    return (
        <ClerkProvider
            publishableKey={CLERK_PUBLISHABLE_KEY}
            appearance={clerkAppearance}
            routerPush={(to) => navigate(sameOriginPath(to))}
            routerReplace={(to) => navigate(sameOriginPath(to), { replace: true })}
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/onboarding"
            afterSignOutUrl="/"
        >
            <ClerkAuth>{children}</ClerkAuth>
        </ClerkProvider>
    );
}

// clerk sometimes hands over a full url on our own origin; the router only wants the path
function sameOriginPath(to: string): string {
    if (!/^https?:\/\//.test(to)) return to;
    const url = new URL(to);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : to;
}

// ---------- dev mode ----------

const devInfo: AuthInfo = { mode: 'dev', status: 'signed-in', displayName: 'Local dev user', suggestedName: null, email: null, signOut: null };

function DevAuth({ children }: { children: ReactNode }) {
    setTokenGetter(async () => null);
    return <AuthContext.Provider value={devInfo}>{children}</AuthContext.Provider>;
}

// ---------- clerk mode ----------

function ClerkAuth({ children }: { children: ReactNode }) {
    const { getToken, userId, isLoaded, isSignedIn } = useAuth();
    const { user } = useUser();
    const clerk = useClerk();
    const queryClient = useQueryClient();

    // set during render (not in an effect) so the very first query already sends the token
    setTokenGetter(() => getToken());

    // someone signed out (or switched accounts): drop their cached data. resetQueries rather than
    // clear, because clear cancels in-flight requests without telling the components waiting on them
    const lastUserId = useRef(userId);
    useEffect(() => {
        if (lastUserId.current && lastUserId.current !== userId) void queryClient.resetQueries();
        lastUserId.current = userId;
    }, [userId, queryClient]);

    const status: AuthStatus = !isLoaded ? 'loading' : isSignedIn ? 'signed-in' : 'signed-out';

    const info = useMemo<AuthInfo>(
        () => ({
            mode: 'clerk',
            status,
            displayName: user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Signed in',
            suggestedName: user?.fullName || user?.firstName || null,
            email: user?.primaryEmailAddress?.emailAddress ?? null,
            signOut: () => clerk.signOut()
        }),
        [status, user, clerk]
    );

    return <AuthContext.Provider value={info}>{children}</AuthContext.Provider>;
}
