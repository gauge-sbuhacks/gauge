// providers (query cache, auth, tooltips, toasts) wrapped around the router

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ApiError } from '@/api/api.ts';
import { Toaster } from '@/components/ui/sonner.tsx';
import { TooltipProvider } from '@/components/ui/tooltip.tsx';
import { AuthProvider } from '@/context/AuthContext.tsx';
import { router } from '@/router.tsx';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // don't retry things that will fail the same way again (404, validation, signed out)
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2
        }
    }
});

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <TooltipProvider delayDuration={200}>
                    <RouterProvider router={router} />
                </TooltipProvider>
            </AuthProvider>
            <Toaster position="bottom-right" />
        </QueryClientProvider>
    );
}
