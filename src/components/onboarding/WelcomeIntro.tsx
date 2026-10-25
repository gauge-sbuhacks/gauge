// the last onboarding screen: the boiler gauge's needle drops into the green, then the welcome and the three
// things to know arrive one after another. every piece uses fill-mode-both so it stays hidden
// until its own delay comes up.

import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, FlaskConical, LoaderCircle, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { PURPOSE_HINTS, type Purpose } from '@shared/schemas.ts';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { Gus } from '@/components/brand/Mascots.tsx';
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
// ("keep the pressure off"), with Gus stamping you in beside it
function WelcomeGauge() {
    const [value, setValue] = useState(92);
    useEffect(() => {
        const id = window.setTimeout(() => setValue(8), 350);
        return () => window.clearTimeout(id);
    }, []);
    return (
        <div className="flex items-end gap-2">
            <PressureGauge value={value} variant="boiler" size={150} />
            <Gus pose="certify" size={88} className="mascot-bob h-auto w-[88px]" />
        </div>
    );
}

// one of the three ways to start, as a card you click
function StartChoice({
    icon,
    title,
    text,
    badge,
    busy,
    onClick,
    ...rest
}: {
    icon: ReactNode;
    title: string;
    text: string;
    badge?: string;
    busy?: boolean;
    onClick?: () => void;
} & Omit<ComponentProps<'button'>, 'title'>) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className={cn(
                'group flex h-full w-full flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-brass/60 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                badge && 'border-brass/50'
            )}
            {...rest}
        >
            <span className="flex w-full items-center justify-between gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brass-soft text-brass">{busy ? <LoaderCircle className="size-4 animate-spin" /> : icon}</span>
                {badge && <span className="rounded-full bg-brass-soft px-2 py-0.5 text-[11px] font-semibold text-brass">{badge}</span>}
            </span>
            <span className="font-medium">{title}</span>
            <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
                Start
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
        </button>
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

    const walkthrough = (
        <StartChoice
            key="guide"
            icon={<Gus pose="calm" size={28} className="h-auto w-6" />}
            title="Walk me through it"
            text="Gus walks you through adding an example car, one step at a time. About two minutes."
            badge={exploring ? undefined : 'Recommended'}
            onClick={() => navigate('/assets/new?guide=1', { replace: true })}
        />
    );
    const testData = (
        <StartChoice
            key="sample"
            icon={<FlaskConical className="size-4" />}
            title="Load test data"
            text="10 sample items with value history to click around. Remove them any time."
            badge={exploring ? 'Recommended' : undefined}
            busy={loadSample.isPending}
            onClick={exploreWithTestData}
        />
    );
    const addOwn = (
        <AddAssetDialog key="own">
            <StartChoice icon={<PenLine className="size-4" />} title="Add my own" text="Start with something you own. Type it in, or snap a photo." />
        </AddAssetDialog>
    );
    const choices = exploring ? [testData, walkthrough, addOwn] : [walkthrough, testData, addOwn];

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
                <h2 className="mt-12 font-medium">How do you want to start?</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">{choices}</div>
                <Button size="sm" variant="ghost" className="mt-3 -ml-2 text-muted-foreground" onClick={() => navigate('/', { replace: true })}>
                    Skip to the dashboard
                </Button>
            </Arrive>
        </div>
    );
}
