// first-run questions: name, marketplace location, and what brings you here. the answers are
// saved as the profile, then WelcomeIntro introduces the app. people who already have a profile
// are sent straight to the dashboard, unless they came to edit it (/onboarding?edit).

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, CornerDownLeft, LoaderCircle } from 'lucide-react';
import { marketLocationSchema, type MarketLocation } from '@shared/marketplace.ts';
import { PURPOSES, PURPOSE_HINTS, PURPOSE_LABELS, type ProfileRecord, type Purpose } from '@shared/schemas.ts';
import { Logo } from '@/components/common/Logo.tsx';
import { FullPageLoading } from '@/components/common/QueryStates.tsx';
import { WelcomeIntro } from '@/components/onboarding/WelcomeIntro.tsx';
import { SiteFooter } from '@/components/layout/SiteFooter.tsx';
import { Backdrop } from '@/components/brand/Backdrop.tsx';
import { MascotQuestion, type Speaker } from '@/components/brand/MascotQuestion.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useProfile, useSaveProfile } from '@/hooks/useProfile.ts';
import { APP_NAME } from '@/config.ts';
import { cn } from '@/lib/utils.ts';

const QUESTION_COUNT = 3;
const INTRO = QUESTION_COUNT;
const LEAVE_MS = 220;

export default function OnboardingView() {
    const auth = useAuthInfo();
    const [params] = useSearchParams();
    const editing = params.has('edit');
    const profile = useProfile({ enabled: auth.status === 'signed-in' });

    // decided once, from the profile as it was on arrival. saving at the end of the questions fills
    // the profile in, and that must not bounce the person away before the welcome screen plays
    const [arrival, setArrival] = useState<{ profile: ProfileRecord | null } | null>(null);
    if (arrival === null && (profile.isSuccess || profile.isError)) setArrival({ profile: profile.data?.profile ?? null });

    if (auth.status === 'loading') return <FullPageLoading />;
    if (auth.status === 'signed-out') return <Navigate replace to="/sign-in" />;
    if (arrival === null) return <FullPageLoading />;
    if (arrival.profile && !editing) return <Navigate replace to="/" />;
    return <OnboardingFlow initial={arrival.profile} suggestedName={auth.suggestedName ?? ''} />;
}

function OnboardingFlow({ initial, suggestedName }: { initial: ProfileRecord | null; suggestedName: string }) {
    const auth = useAuthInfo();
    const navigate = useNavigate();
    const save = useSaveProfile();

    const [name, setName] = useState(initial?.name ?? suggestedName);
    const [marketLocation, setMarketLocation] = useState<MarketLocation>(initial?.marketLocation ?? { city: '', region: '', postalCode: '', country: 'US' });
    const [purpose, setPurpose] = useState<Purpose | ''>(initial?.purpose ?? '');
    const [error, setError] = useState<string | null>(null);

    // stage transitions: the current screen fades up and out, then the next one rises in.
    // going back reverses the direction so it feels like returning
    const [step, setStep] = useState(0);
    const [dir, setDir] = useState<1 | -1>(1);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);

    const go = (next: number) => {
        if (leaving) return;
        const d = next > step ? 1 : -1;
        setError(null);
        setDir(d);
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setStep(next);
            return;
        }
        setLeaving(true);
        timer.current = window.setTimeout(() => {
            setStep(next);
            setLeaving(false);
        }, LEAVE_MS);
    };


    const submitName = (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return setError('Tell us what to call you.');
        go(1);
    };

    const submitLocation = (e: FormEvent) => {
        e.preventDefault();
        const parsed = marketLocationSchema.safeParse(marketLocation);
        if (!parsed.success) return setError(parsed.error.issues[0].message);
        setMarketLocation(parsed.data);
        go(2);
    };

    const submitPurpose = (e: FormEvent) => {
        e.preventDefault();
        if (!purpose) return setError('Pick the closest one.');
        save.mutate(
            { name: name.trim(), occupation: initial?.occupation ?? null, marketLocation, purpose },
            { onSuccess: () => go(INTRO), onError: (err) => setError(err.message) }
        );
    };

    const stageClass = leaving
        ? cn('animate-out fade-out duration-200 ease-in fill-mode-forwards', dir === 1 ? 'slide-out-to-top-4' : 'slide-out-to-bottom-4')
        : cn('animate-in fade-in duration-500 ease-out fill-mode-both', dir === 1 ? 'slide-in-from-bottom-6' : 'slide-in-from-top-6');

    const firstName = name.trim().split(/\s+/)[0] || 'there';
    let stage: ReactNode;
    if (step === 0) {
        stage = (
            <Question
                speaker={{ who: 'boyle', pose: 'watch' }}
                id="name"
                question="First, what should we call you?"
                help={`This is how your name appears in ${APP_NAME} and on the inventories you export.`}
                error={error}
                onSubmit={submitName}
            >
                <Input
                    id="name"
                    autoFocus
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(null);
                    }}
                    placeholder="Your name"
                    maxLength={80}
                    aria-invalid={Boolean(error)}
                    className="h-12 px-3.5 text-lg md:text-lg"
                />
            </Question>
        );
    } else if (step === 1) {
        stage = (
            <Question
                speaker={{ who: 'gus', pose: 'calm' }}
                id="city"
                question="Where will you be selling from?"
                help="Your city and postal code help us research relevant markets. You can update this later. No street address needed."
                error={error}
                onSubmit={submitLocation}
                onBack={() => go(0)}
                enterHint={false}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                    {([
                        ['city', 'City', 'address-level2', 'New York'],
                        ['region', 'State / region', 'address-level1', 'NY'],
                        ['postalCode', 'ZIP / postal code', 'postal-code', '10001'],
                        ['country', 'Country', 'country', 'United States']
                    ] as const).map(([key, label, complete, placeholder]) => (
                        <label key={key} className="space-y-2 text-sm font-medium">
                            <span>{label}</span>
                            {key === 'country' ? <Select value={marketLocation.country} onValueChange={country => { setMarketLocation(v => ({ ...v, country })); setError(null); }}>
                                <SelectTrigger id="country" className="w-full" aria-label="Country"><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    {[['US','United States'],['CA','Canada'],['GB','United Kingdom'],['AU','Australia'],['DE','Germany'],['FR','France'],['JP','Japan'],['NL','Netherlands'],['CH','Switzerland']].map(([code,name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
                                    {!['US','CA','GB','AU','DE','FR','JP','NL','CH'].includes(marketLocation.country) && <SelectItem value={marketLocation.country}>{marketLocation.country}</SelectItem>}
                                </SelectContent>
                            </Select> : <Input id={key} autoFocus={key === 'city'} autoComplete={complete} placeholder={placeholder}
                                maxLength={key === 'postalCode' ? 16 : 100}
                                value={marketLocation[key]} onChange={e => { setMarketLocation(v => ({ ...v, [key]: e.target.value })); setError(null); }} />}
                        </label>
                    ))}
                </div>
            </Question>
        );
    } else if (step === 2) {
        stage = (
            <Question
                speaker={{ who: 'puff', pose: 'wink' }}
                id="purpose"
                question={`What brings you to ${APP_NAME}?`}
                help="Pick the one closest to why you're here."
                error={error}
                onSubmit={submitPurpose}
                onBack={() => go(1)}
                busy={save.isPending}
                submitLabel={save.isPending ? 'Saving' : 'Finish'}
                enterHint={false}
            >
                <Select
                    value={purpose}
                    onValueChange={(v) => {
                        setPurpose(v as Purpose);
                        setError(null);
                    }}
                >
                    <SelectTrigger id="purpose" autoFocus aria-invalid={Boolean(error)} className="h-12! w-full px-3.5 text-base">
                        <SelectValue placeholder="Choose one" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                        {PURPOSES.map((p) => (
                            <SelectItem key={p} value={p} className="py-2 pl-2.5 text-sm">
                                {PURPOSE_LABELS[p]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {purpose && (
                    <p key={purpose} className="mt-4 border-l-2 border-brass/60 pl-3 text-sm leading-relaxed text-muted-foreground animate-in fade-in duration-300 motion-reduce:animate-none">
                        {PURPOSE_HINTS[purpose]}
                    </p>
                )}
            </Question>
        );
    } else {
        stage = <WelcomeIntro firstName={firstName} purpose={purpose || 'exploring'} />;
    }

    return (
        <div className="relative isolate flex min-h-svh flex-col">
            {/* the pipeworks frame the question in the middle */}
            <Backdrop />
            <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 pt-6">
                <Link to="/home" aria-label={`${APP_NAME} home`}>
                    <Logo />
                </Link>
                {step < INTRO && (
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {initial && (
                            <button type="button" onClick={() => navigate('/')} className="transition-colors hover:text-foreground">
                                Cancel
                            </button>
                        )}
                        {auth.signOut && (
                            <button type="button" onClick={() => auth.signOut?.()} className="transition-colors hover:text-foreground">
                                Sign out
                            </button>
                        )}
                    </div>
                )}
            </header>

            {step < INTRO && (
                <div className="mx-auto mt-6 flex w-full max-w-2xl items-center gap-4 px-6">
                    <div className="grid flex-1 grid-cols-3 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={QUESTION_COUNT} aria-valuenow={step + 1}>
                        {Array.from({ length: QUESTION_COUNT }, (_, i) => (
                            <div key={i} className="h-2 overflow-hidden rounded-full border border-border bg-inset shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
                                <div className={cn('h-full bg-[linear-gradient(180deg,#FCE3A8,#F4A906_45%,#C68A06)] transition-[width] duration-500 ease-out', i <= step ? 'w-full' : 'w-0')} />
                            </div>
                        ))}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {step + 1} of {QUESTION_COUNT}
                    </span>
                </div>
            )}

            <main className="flex flex-1 items-center">
                <div className="mx-auto w-full max-w-2xl px-6 py-16">
                    <div key={step} className={cn('max-w-xl motion-reduce:animate-none', stageClass)}>
                        {stage}
                    </div>
                </div>
            </main>
            <SiteFooter width="max-w-2xl" className="border-t-0" />
        </div>
    );
}

function Question({
    speaker,
    id,
    question,
    help,
    error,
    children,
    onSubmit,
    onBack,
    onSkip,
    busy = false,
    submitLabel = 'Continue',
    enterHint = true
}: {
    // the mascot asking it
    speaker: Speaker;
    id: string;
    question: string;
    help: string;
    error: string | null;
    children: ReactNode;
    onSubmit: (e: FormEvent) => void;
    onBack?: () => void;
    onSkip?: () => void;
    busy?: boolean;
    submitLabel?: string;
    // enter opens a select instead of submitting, so dropdown stages hide the hint
    enterHint?: boolean;
}) {
    return (
        <form onSubmit={onSubmit} noValidate>
            <MascotQuestion speaker={speaker} question={question} help={help} labelFor={id} />

            <div className="mt-8">{children}</div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            <div className="mt-8 flex items-center gap-2">
                <Button type="submit" size="lg" className="h-10 px-4" disabled={busy}>
                    {submitLabel}
                    {busy ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
                </Button>
                {onBack && (
                    <Button type="button" variant="ghost" size="lg" className="h-10 px-3" onClick={onBack} disabled={busy}>
                        <ArrowLeft data-icon="inline-start" />
                        Back
                    </Button>
                )}
                {onSkip && (
                    <Button type="button" variant="ghost" size="lg" className="h-10 px-3 text-muted-foreground" onClick={onSkip}>
                        Skip
                    </Button>
                )}
                {enterHint && (
                    <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                        press Enter
                        <CornerDownLeft className="size-3" />
                    </span>
                )}
            </div>
        </form>
    );
}
