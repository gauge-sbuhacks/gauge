// every page, in one place. pages load on demand (lazy), so opening the dashboard
// doesn't download the asset form, the charts on other pages, and so on.

import { Outlet, ScrollRestoration, createBrowserRouter } from 'react-router';
import AppGate from '@/components/layout/AppGate.tsx';
import { LoadingBlock } from '@/components/common/QueryStates.tsx';
import { RouteErrorView } from '@/views/NotFoundView.tsx';

// turns a view module's default export into what react router's `lazy` expects
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
    {
        // new pages start at the top; back/forward returns to where you were
        element: (
            <>
                <Outlet />
                <ScrollRestoration />
            </>
        ),
        errorElement: <RouteErrorView />,
        hydrateFallbackElement: <LoadingBlock />,
        children: [
            // public. signed-out visitors also get the landing page at "/" (see AppGate)
            { path: 'home', lazy: page(() => import('@/views/LandingView.tsx')) },
            // the * lets clerk use sub-paths like /sign-in/factor-one and /sign-up/verify-email-address
            {
                path: 'sign-in/*',
                lazy: async () => {
                    const { default: AuthView } = await import('@/views/AuthView.tsx');
                    return { Component: () => <AuthView mode="sign-in" /> };
                }
            },
            {
                path: 'sign-up/*',
                lazy: async () => {
                    const { default: AuthView } = await import('@/views/AuthView.tsx');
                    return { Component: () => <AuthView mode="sign-up" /> };
                }
            },
            { path: 'onboarding', lazy: page(() => import('@/views/OnboardingView.tsx')) },
            // legal pages, readable without signing in
            ...(['privacy', 'terms', 'accessibility'] as const).map((doc) => ({
                path: doc,
                lazy: async () => {
                    const { default: LegalView } = await import('@/views/LegalView.tsx');
                    return { Component: () => <LegalView doc={doc} /> };
                }
            })),

            // the app. AppGate handles signed-out visitors and unfinished onboarding
            {
                path: '/',
                element: <AppGate />,
                children: [
                    { index: true, lazy: page(() => import('@/views/DashboardView.tsx')) },
                    { path: 'assets', lazy: page(() => import('@/views/AssetsView.tsx')) },
                    // adding is a step-by-step flow; editing keeps the full form
                    { path: 'assets/new', lazy: page(() => import('@/views/AddAssetView.tsx')) },
                    { path: 'assets/:id', lazy: page(() => import('@/views/AssetDetailView.tsx')) },
                    {
                        path: 'assets/:id/edit',
                        lazy: async () => {
                            const { default: AssetFormView } = await import('@/views/AssetFormView.tsx');
                            return { Component: () => <AssetFormView mode="edit" /> };
                        }
                    },
                    { path: 'settings', lazy: page(() => import('@/views/SettingsView.tsx')) },
                    { path: '*', lazy: page(() => import('@/views/NotFoundView.tsx')) }
                ]
            }
        ]
    }
]);
