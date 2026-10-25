// the last onboarding screen: the boiler gauge's needle drops into the green, then the welcome and the three
// things to know arrive one after another. every piece uses fill-mode-both so it stays hidden
// until its own delay comes up.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, FlaskConical, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PURPOSE_HINTS, type Purpose } from '@shared/schemas.ts';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { Puff } from '@/components/brand/Mascots.tsx';
import { PressureGauge } from '@/components/brand/PressureGauge.tsx';
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

// the kit's brass boiler gauge: the needle starts in the red and eases down into the green
// ("keep the pressure off"), with Puff floating beside it
function WelcomeGauge() {
    const [value, setValue] = useState(92);
    useEffect(() => {
        const id = window.setTimeout(() => setValue(8), 350);
        return () => window.clearTimeout(id);
    }, []);
    return (
        <div className="flex items-end gap-2">
            <PressureGauge value={value} variant="boiler" size={150} />
            <Puff pose="happy" size={64} className="mascot-bob mb-1" />
        </div>
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
                <h1 className="mt-8 font-display text-4xl leading-[0.95] font-black tracking-[0.01em] uppercase sm:text-5xl">
                    Welcome to {APP_NAME}, {firstName}.
                </h1>
            </Arrive>
            <Arrive at={750}>
                <p className="mt-3 max-w-lg text-lg leading-relaxed text-pretty text-muted-foreground">{PURPOSE_HINTS[purpose]}</p>
            </Arrive>

            <ol className="mt-10 space-y-6">
                {STEPS.map((s, i) => (
                    <Arrive key={s.title} as="li" at={1150 + i * 220} className="flex gap-4">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#5A3A06] bg-[linear-gradient(180deg,#FAD06A,#F4A906_52%,#C68A06)] font-display text-base font-black text-sbu-umber tabular-nums">{i + 1}</span>
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
