// every page, in one place. pages load on demand (lazy), so opening the dashboard
// doesn't download the asset form, the charts on other pages, and so on.

import { createBrowserRouter } from 'react-router';
import AppShell from '@/components/layout/AppShell.tsx';
import { LoadingBlock } from '@/components/common/QueryStates.tsx';
import { RouteErrorView } from '@/views/NotFoundView.tsx';

// turns a view module's default export into what react router's `lazy` expects
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

export const router = createBrowserRouter([
    {
        path: '/',
        element: <AppShell />,
        errorElement: <RouteErrorView />,
        hydrateFallbackElement: <LoadingBlock />,
        children: [
            { index: true, lazy: page(() => import('@/views/DashboardView.tsx')) },
            { path: 'assets', lazy: page(() => import('@/views/AssetsView.tsx')) },
            {
                path: 'assets/new',
                lazy: async () => {
                    const { default: AssetFormView } = await import('@/views/AssetFormView.tsx');
                    return { Component: () => <AssetFormView mode="create" /> };
                }
            },
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
]);
