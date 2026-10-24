// 404 page, plus the catch-all error screen for crashes inside a page

import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { EmptyState } from '@/components/layout/PageHeader.tsx';

export default function NotFoundView({ what = 'page' }: { what?: string }) {
    return (
        <EmptyState
            title={`That ${what} doesn't exist`}
            description="It may have been deleted, or the link is wrong."
            actions={
                <>
                    <Button asChild variant="outline">
                        <Link to="/assets">All assets</Link>
                    </Button>
                    <Button asChild>
                        <Link to="/">Dashboard</Link>
                    </Button>
                </>
            }
        />
    );
}

export function RouteErrorView() {
    const error = useRouteError();
    const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error';
    return (
        <div className="mx-auto max-w-lg p-8">
            <EmptyState
                title="Something broke on this page"
                description={<span className="font-mono text-xs">{message}</span>}
                actions={
                    <Button onClick={() => window.location.assign('/')} variant="outline">
                        Back to the dashboard
                    </Button>
                }
            />
        </div>
    );
}
