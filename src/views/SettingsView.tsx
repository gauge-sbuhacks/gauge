// setup: what's configured (sign-in, database, data providers), which keys are missing,
// and the test data controls. reads /api/health, which only reports names and yes/no, never secrets.

import { Link } from 'react-router';
import { useProfile } from '@/hooks/useProfile.ts';
import { CircleCheck, CircleDashed, CircleX, Clock, Database, FlaskConical, KeyRound, LoaderCircle, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { HealthResponse, ProviderStatus } from '@shared/schemas.ts';
import { useTestData } from '@/components/common/TestDataControls.tsx';
import { PageHeader } from '@/components/layout/PageHeader.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { APP_NAME, CLERK_PUBLISHABLE_KEY } from '@/config.ts';
import { useHealth } from '@/hooks/usePortfolio.ts';
import { cn } from '@/lib/utils.ts';

const PROVIDER_STATUS: Record<ProviderStatus, { label: string; icon: typeof CircleCheck; className: string }> = {
    ready: { label: 'Ready', icon: CircleCheck, className: 'text-gain' },
    needs_key: { label: 'Needs a key', icon: KeyRound, className: 'text-[#9a6a00]' },
    planned: { label: 'Planned', icon: Clock, className: 'text-muted-foreground' }
};

function StatusLine({ ok, warn, title, message }: { ok: boolean; warn?: boolean; title: string; message: string }) {
    const Icon = ok ? (warn ? CircleDashed : CircleCheck) : CircleX;
    return (
        <div className="flex items-start gap-3">
            <Icon className={cn('mt-0.5 size-5 shrink-0', ok ? (warn ? 'text-[#9a6a00]' : 'text-gain') : 'text-loss')} />
            <div>
                <div className="font-medium">{title}</div>
                <p className="text-sm text-muted-foreground">{message}</p>
            </div>
        </div>
    );
}

const ENV_VARS: { name: string; where: 'server' | 'browser'; needed: string; what: string }[] = [
    { name: 'GOLD_API_KEY', where: 'server', needed: 'For metal history', what: 'Free Gold API history key. 10 history/OHLC requests per hour; cached for a day.' },
    { name: 'EBAY_CLIENT_ID', where: 'server', needed: 'For live market research', what: 'eBay production application ID for active comparable listings.' },
    { name: 'EBAY_CLIENT_SECRET', where: 'server', needed: 'For live market research', what: 'eBay production secret. Keep it on the API only.' },
    { name: 'MONGODB_URI', where: 'server', needed: 'For deploys', what: 'MongoDB Atlas connection string. Locally it falls back to MongoDB on this computer.' },
    { name: 'VITE_CLERK_PUBLISHABLE_KEY', where: 'browser', needed: 'For sign-in', what: 'Clerk publishable key (pk_...). Turns on the sign-in screen.' },
    { name: 'CLERK_PUBLISHABLE_KEY', where: 'server', needed: 'For sign-in', what: 'The same pk_... key, for the API.' },
    { name: 'CLERK_SECRET_KEY', where: 'server', needed: 'For sign-in', what: 'Clerk secret key (sk_...). Lets the API verify who is calling.' },
    { name: 'RENTCAST_API_KEY', where: 'server', needed: 'Optional', what: 'Home value estimates. Free plan: 50 requests a month.' },
    { name: 'VINAUDIT_API_KEY', where: 'server', needed: 'Optional', what: 'Vehicle market values. Trial: 100 queries, 2 per lookup.' },
    { name: 'GAUGE_ALLOW_DEV_AUTH', where: 'server', needed: 'Optional', what: 'Set to true on a preview deploy to skip sign-in. Everyone shares one account, so test data only.' },
    { name: 'GEMINI_API_KEY', where: 'server', needed: 'For photo identification', what: 'Gemini API key. Picks a category, fills that category\'s questions, and estimates a price only when a lookup did not.' },
    { name: 'THEWATCH_API_KEY', where: 'server', needed: 'For watch prices', what: 'The Watch API token (THEWATCHAPI_TOKEN also works). Asking-price averages for a brand and reference number.' }
];

function HealthCards({ health }: { health: HealthResponse }) {
    const frontendClerk = CLERK_PUBLISHABLE_KEY != null;
    const mismatch = frontendClerk !== (health.auth.mode === 'clerk');
    return (
        <Card>
            <CardHeader>
                <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <StatusLine ok={health.auth.mode !== 'misconfigured'} warn={health.auth.mode === 'dev'} title={health.auth.mode === 'clerk' ? 'Sign-in: Clerk' : 'Sign-in: off (local dev user)'} message={health.auth.message} />
                {mismatch && (
                    <StatusLine
                        ok={false}
                        title="Sign-in keys don't match"
                        message={
                            frontendClerk
                                ? 'The browser has VITE_CLERK_PUBLISHABLE_KEY but the API has no Clerk keys. Add CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY too.'
                                : 'The API has Clerk keys but the browser does not. Add VITE_CLERK_PUBLISHABLE_KEY and restart npm run dev.'
                        }
                    />
                )}
                <StatusLine ok={health.database.connected} title={`Database: ${health.database.kind === 'local' ? 'local MongoDB' : health.database.kind === 'remote' ? 'MongoDB (MONGODB_URI)' : 'not set up'}`} message={health.database.message} />
            </CardContent>
        </Card>
    );
}

export default function SettingsView() {
    const profile=useProfile();
    const sellingLocation=profile.data?.profile?.marketLocation;
    const health = useHealth();
    const { sampleCount, loadSample, removeSample, busy } = useTestData();

    return (
        <div className="space-y-6">
            <PageHeader title="Setup" description={`Your location and connections for ${APP_NAME}.`} />

                <Card>
                <CardHeader><CardTitle>Selling location</CardTitle><CardDescription>Used for marketplace research and relevant platform searches.</CardDescription></CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{sellingLocation ? `${sellingLocation.city}, ${sellingLocation.region} · ${sellingLocation.postalCode} · ${sellingLocation.country}` : 'No selling location set yet'}</p><Button variant="outline" asChild><Link to="/onboarding?edit">Update location</Link></Button></CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Market history</CardTitle><CardDescription>Free historical sources, shown separately from your recorded values.</CardDescription></CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <p><a href="https://gold-api.com/pricing" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">Metals</a>: add a free Gold API key to enable daily history. Set the metal, weight, and purity on your item.</p>
                    <p><a href="https://mtgjson.com/downloads/all-files/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">Magic cards</a>: select the game, set code, collector number, and finish. Your developer can then import the free price history. No key needed.</p>
                    <p className="text-xs text-muted-foreground">Other items build history from values you record and comparable asking prices you research. Historical sold prices are not connected.</p>
                </CardContent>
            </Card>

            {health.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> Checking...
                </div>
            ) : health.error ? (
            <Card>
                    <CardContent>
                        <StatusLine ok={false} title="Can't reach the API" message={`${health.error.message} Locally, npm run dev starts both the site and the API.`} />
                    </CardContent>
                </Card>
            ) : (
                health.data && <HealthCards health={health.data} />
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="size-4" />
                        Data providers
                    </CardTitle>
                    <CardDescription>Lookups only ever suggest. Manual entry works without any of them.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Provider</TableHead>
                                <TableHead>What it covers</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(health.data?.providers ?? []).map((p) => {
                                const st = PROVIDER_STATUS[p.status];
                                return (
                                    <TableRow key={p.id}>
                                        <TableCell className="font-medium whitespace-nowrap">{p.label}</TableCell>
                                        <TableCell className="min-w-56 whitespace-normal">
                                            {p.covers}
                                            <div className="text-xs text-muted-foreground">{p.note}</div>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            <span className={cn('inline-flex items-center gap-1.5 text-sm', st.className)}>
                                                <st.icon className="size-4" />
                                                {st.label}
                                            </span>
                                            {p.envVar && p.status === 'needs_key' && <div className="font-mono text-xs text-muted-foreground">{p.envVar}</div>}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Developer setup & test data</summary><div className="mt-5 space-y-5">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <KeyRound className="size-4" />
                        Environment variables
                    </CardTitle>
                    <CardDescription>
                        Locally: put them in <code className="text-xs">.env.local</code> (copy <code className="text-xs">.env.example</code>) and restart npm run dev. On Vercel: Project Settings, Environment Variables, then redeploy.
                    </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Name</TableHead>
                                <TableHead>Used by</TableHead>
                                <TableHead>When</TableHead>
                                <TableHead>What it does</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ENV_VARS.map((v) => (
                                <TableRow key={v.name}>
                                    <TableCell className="font-mono text-xs whitespace-nowrap">{v.name}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">{v.where === 'browser' ? 'Browser' : 'API'}</Badge>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-muted-foreground">{v.needed}</TableCell>
                                    <TableCell className="min-w-64 whitespace-normal text-muted-foreground">{v.what}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                        Only variables starting with VITE_ reach the browser. Secret keys stay on the API side.
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FlaskConical className="size-4" />
                        Test data
                    </CardTitle>
                    <CardDescription>
                        Ten made-up belongings (a 2020 Cadillac XT6, 89 Carnation Road, a Rolex, gold coins, and more) with a few years of value history. They are flagged as test data, and removing them never touches what you entered.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                    <Button onClick={loadSample} disabled={busy}>
                        {sampleCount > 0 ? <RotateCcw data-icon="inline-start" /> : <FlaskConical data-icon="inline-start" />}
                        {sampleCount > 0 ? 'Reset test portfolio' : 'Load test portfolio'}
                    </Button>
                    <Button variant="destructive" onClick={removeSample} disabled={busy || sampleCount === 0}>
                        <Trash2 data-icon="inline-start" />
                        Remove test data
                    </Button>
                    <span className="text-sm text-muted-foreground">{sampleCount > 0 ? `${sampleCount} test assets loaded` : 'None loaded'}</span>
                </CardContent>
            </Card>
            </div></details>
        </div>
    );
}
