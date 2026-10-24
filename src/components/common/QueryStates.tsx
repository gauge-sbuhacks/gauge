// loading and error states shared by every page

import { CircleAlert, LoaderCircle, RotateCw } from 'lucide-react';
import { Link } from 'react-router';
import { ApiError } from '@/api/api.ts';
import { Button } from '@/components/ui/button.tsx';

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {label}
        </div>
    );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
    const apiError = error instanceof ApiError ? error : null;
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    const isSetup = apiError && ['db_unreachable', 'db_not_configured', 'auth_not_configured', 'network'].includes(apiError.code);

    return (
        <div className="mx-auto max-w-lg rounded-xl bg-card p-6 text-center ring-1 ring-foreground/10">
            <CircleAlert className="mx-auto size-6 text-loss" />
            <h2 className="mt-2 font-semibold">Couldn't load your portfolio</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            <div className="mt-4 flex justify-center gap-2">
                {onRetry && (
                    <Button variant="outline" onClick={onRetry}>
                        <RotateCw data-icon="inline-start" />
                        Try again
                    </Button>
                )}
                {isSetup && (
                    <Button asChild>
                        <Link to="/settings">Open Setup</Link>
                    </Button>
                )}
            </div>
        </div>
    );
}
