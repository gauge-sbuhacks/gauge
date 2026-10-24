// who is signed in. two modes:
//   - clerk: VITE_CLERK_PUBLISHABLE_KEY is set, so signed-out visitors see the sign-in screen
//   - dev: no key, so the app runs as the "local dev user" (the api does the same)
// either way, components call useAuthInfo() and don't care which mode it is.

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, useAuth, useClerk, useUser } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { setTokenGetter } from '@/api/api.ts';
import { CLERK_PUBLISHABLE_KEY } from '@/config.ts';
import SignInView from '@/views/SignInView.tsx';

export interface AuthInfo {
    mode: 'clerk' | 'dev';
    displayName: string;
    email: string | null;
    signOut: (() => Promise<void>) | null;
}

const AuthContext = createContext<AuthInfo | null>(null);

export function useAuthInfo(): AuthInfo {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuthInfo() has to be used inside <AuthProvider>');
    return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    if (!CLERK_PUBLISHABLE_KEY) return <DevAuth>{children}</DevAuth>;
    return (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
            <ClerkAuth>{children}</ClerkAuth>
        </ClerkProvider>
    );
}

// ---------- dev mode ----------

const devInfo: AuthInfo = { mode: 'dev', displayName: 'Local dev user', email: null, signOut: null };

function DevAuth({ children }: { children: ReactNode }) {
    setTokenGetter(async () => null);
    return <AuthContext.Provider value={devInfo}>{children}</AuthContext.Provider>;
}

// ---------- clerk mode ----------

function ClerkAuth({ children }: { children: ReactNode }) {
    const { getToken, userId } = useAuth();
    const { user } = useUser();
    const clerk = useClerk();
    const queryClient = useQueryClient();

    // set during render (not in an effect) so the very first query already sends the token
    setTokenGetter(() => getToken());

    // a different person signed in on this browser: drop the previous person's cached data
    const lastUserId = useRef(userId);
    useEffect(() => {
        if (lastUserId.current !== userId) queryClient.clear();
        lastUserId.current = userId;
    }, [userId, queryClient]);

    const info = useMemo<AuthInfo>(
        () => ({
            mode: 'clerk',
            displayName: user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Signed in',
            email: user?.primaryEmailAddress?.emailAddress ?? null,
            signOut: () => clerk.signOut()
        }),
        [user, clerk]
    );

    return (
        <>
            <Show when="signed-out">
                <SignInView />
            </Show>
            <Show when="signed-in">
                <AuthContext.Provider value={info}>{children}</AuthContext.Provider>
            </Show>
        </>
    );
}
