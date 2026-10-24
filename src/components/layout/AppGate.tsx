// what each visitor sees before the app itself:
//   - signed out on "/": the landing page. signed out anywhere else: sign in, then come back
//   - signed in without a profile: onboarding
//   - otherwise: the app frame (AppShell) and the page they asked for

import { Suspense, lazy } from 'react';
import { Navigate, useLocation } from 'react-router';
import AppShell from '@/components/layout/AppShell.tsx';
import { FullPageLoading } from '@/components/common/QueryStates.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useProfile } from '@/hooks/useProfile.ts';

const LandingView = lazy(() => import('@/views/LandingView.tsx'));

export default function AppGate() {
    const auth = useAuthInfo();
    const location = useLocation();
    const profile = useProfile({ enabled: auth.status === 'signed-in' });

    if (auth.status === 'loading') return <FullPageLoading />;

    if (auth.status === 'signed-out') {
        if (location.pathname === '/') {
            return (
                <Suspense fallback={<FullPageLoading />}>
                    <LandingView />
                </Suspense>
            );
        }
        const back = window.location.origin + location.pathname + location.search;
        return <Navigate replace to={`/sign-in?redirect_url=${encodeURIComponent(back)}`} />;
    }

    if (profile.isPending) return <FullPageLoading />;
    // if the profile can't load (database down), let them in anyway; the pages show the real error
    if (profile.isSuccess && !profile.data.profile) return <Navigate replace to="/onboarding" />;
    return <AppShell />;
}
