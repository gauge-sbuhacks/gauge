// the last onboarding screen: a gauge needle sweeps into place, then the welcome and the three
// things to know arrive one after another. every piece uses fill-mode-both so it stays hidden
// until its own delay comes up.

import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, FlaskConical, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PURPOSE_HINTS, type Purpose } from '@shared/schemas.ts';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useLoadSample } from '@/hooks/usePortfolio.ts';
import { APP_NAME } from '@/config.ts';
import { cn } from '@/lib/utils.ts';

const STEPS = [
    { title: 'Add what you own', text: 'Start with something valuable: a car, a watch, a laptop. Record the model, condition, and purchase details.' },
    { title: 'Record what it is worth', text: 'Fair market and quick-sale values are kept with their dates, so history builds up on its own.' },
    { title: 'Understand your resale value', text: 'Compare what you paid with current values and see which items need fresh pricing.' }
];

function Arrive({ at, children, className, as: Tag = 'div' }: { at: number; children: ReactNode; className?: string; as?: 'div' | 'li' }) {
    return (
        <Tag
            className={cn('animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out fill-mode-both motion-reduce:animate-none', className)}
            style={{ animationDelay: `${at}ms` }}
        >
            {children}
        </Tag>
    );
}

// a large version of the logo mark. the needle comes to rest in the welcome position
function WelcomeGauge() {
    const ticks = Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI - (i / 10) * Math.PI;
        const r1 = 70;
        const r2 = i % 5 === 0 ? 58 : 63;
        return { x1: 100 + r1 * Math.cos(a), y1: 100 - r1 * Math.sin(a), x2: 100 + r2 * Math.cos(a), y2: 100 - r2 * Math.sin(a) };
    });
    return (
        <svg viewBox="0 0 200 116" className="w-40" aria-hidden>
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="8" strokeLinecap="round" />
            <path d="M 20 100 A 80 80 0 0 1 43.4 43.4" fill="none" stroke="var(--color-brass)" strokeWidth="8" strokeLinecap="round" />
            {ticks.map((t, i) => (
                <line key={i} {...t} stroke="currentColor" strokeOpacity={i % 5 === 0 ? 0.45 : 0.2} strokeWidth="1.5" strokeLinecap="round" />
            ))}
            <g className="needle-sweep" style={{ transformOrigin: '100px 100px', transform: 'rotate(-48deg)', '--needle-from': '-90deg' } as CSSProperties}>
                <line x1="100" y1="100" x2="100" y2="38" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            </g>
            <circle cx="100" cy="100" r="8" fill="currentColor" />
            <circle cx="100" cy="100" r="3" fill="var(--color-background)" />
        </svg>
    );
}

export function WelcomeIntro({ firstName, purpose }: { firstName: string; purpose: Purpose }) {
    const navigate = useNavigate();
    const loadSample = useLoadSample();
    const exploring = purpose === 'exploring';

    const exploreWithTestData = () =>
        loadSample.mutate(undefined, {
            onSuccess: (r) => {
                toast.success(`Loaded ${r.added} test assets`, { description: 'They are marked "Test data" and can be removed any time.' });
                navigate('/', { replace: true });
            },
            onError: (err) => toast.error("Couldn't load test data", { description: err.message })
        });

    const testDataButton = (
        <Button size="lg" variant={exploring ? 'default' : 'outline'} className="h-10 px-4" onClick={exploreWithTestData} disabled={loadSample.isPending}>
            {loadSample.isPending ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <FlaskConical data-icon="inline-start" />}
            Explore with test data
        </Button>
    );
    const addButton = (
        <AddAssetDialog>
            <Button type="button" size="lg" variant={exploring ? 'outline' : 'default'} className="h-10 px-4">
                Add your first asset
                <ArrowRight data-icon="inline-end" />
            </Button>
        </AddAssetDialog>
    );

    return (
        <div>
            <Arrive at={0} className="text-foreground">
                <WelcomeGauge />
            </Arrive>

            <Arrive at={500}>
                <h1 className="mt-8 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                    Welcome to {APP_NAME}, {firstName}.
                </h1>
            </Arrive>
            <Arrive at={750}>
                <p className="mt-3 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">{PURPOSE_HINTS[purpose]}</p>
            </Arrive>

            <ol className="mt-10 space-y-6">
                {STEPS.map((s, i) => (
                    <Arrive key={s.title} as="li" at={1150 + i * 220} className="flex gap-4">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-sm font-medium tabular-nums">{i + 1}</span>
                        <div>
                            <div className="font-medium">{s.title}</div>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                        </div>
                    </Arrive>
                ))}
            </ol>

            <Arrive at={1150 + STEPS.length * 220 + 200}>
                <div className="mt-10 flex flex-wrap items-center gap-3">
                    {exploring ? testDataButton : addButton}
                    {exploring ? addButton : testDataButton}
                    <Button size="lg" variant="ghost" className="h-10 px-3" onClick={() => navigate('/', { replace: true })}>
                        Go to the dashboard
                    </Button>
                </div>
            </Arrive>
        </div>
    );
}
