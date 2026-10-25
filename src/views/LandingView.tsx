// the public product page. signed-out visitors see it at "/", and anyone can open it at /home.

import { useMemo, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Banknote, FileDown, Gem, Gauge, Landmark, PackagePlus, Wrench, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { Gus } from '@/components/brand/Mascots.tsx';
import { RailwayAmbience } from '@/components/brand/RailwayAmbience.tsx';
import { DashboardPreview } from '@/components/landing/DashboardPreview.tsx';
import { HeaderTrain } from '@/components/landing/HeaderTrain.tsx';
import { FlowDiagram } from '@/components/landing/Diagrams.tsx';
import { Reveal } from '@/components/landing/Reveal.tsx';
import { AccountMenu } from '@/components/layout/AccountMenu.tsx';
import { SiteFooter } from '@/components/layout/SiteFooter.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useProfile } from '@/hooks/useProfile.ts';
import { APP_NAME } from '@/config.ts';
import { samplePortfolioItems } from '@/lib/samplePortfolio.ts';
import '@/css/landing.css';

const SECTIONS = [
    { id: 'how', label: 'How it works' },
    { id: 'use-cases', label: 'Use cases' }
];

interface UseCase {
    icon: LucideIcon;
    title: string;
    problem: string;
    answer: string;
}

const USE_CASES: UseCase[] = [
    {
        icon: Gem,
        title: 'Collections that move in value',
        problem: 'Graded cards, watches, coins, and bullion change price month to month, and spreadsheets go stale.',
        answer: 'Grades, reference numbers, and a value history built from every observation you record.'
    },
    {
        icon: Landmark,
        title: 'Estate and financial planning',
        problem: 'Executors and advisors need to know what exists, where it is kept, and roughly what it is worth.',
        answer: 'Location, condition, and every kind of value for each item, in one record you can hand over.'
    },
    {
        icon: Banknote,
        title: 'Deciding what to sell',
        problem: 'You want to free up cash, but need to understand what your belongings could realistically bring in.',
        answer: 'Compare fair market and quick-sale estimates, then explore resale options for the assets you choose.'
    },
    {
        icon: Wrench,
        title: 'Tools and business equipment',
        problem: 'Cost basis, warranties, and service intervals end up scattered across drawers and inboxes.',
        answer: 'Purchase info, warranty end dates, and service reminders, flagged before they lapse.'
    }
];

function scrollToSection(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    history.replaceState(null, '', `#${id}`);
}

export default function LandingView() {
    const auth = useAuthInfo();
    const signedIn = auth.status === 'signed-in';
    const profileQuery = useProfile({ enabled: signedIn });
    // signed in but onboarding isn't finished: that's the next step, not the dashboard
    const needsOnboarding = signedIn && profileQuery.isSuccess && !profileQuery.data.profile;
    const next = !signedIn
        ? { to: '/sign-up', label: 'Create your account' }
        : needsOnboarding
          ? { to: '/onboarding', label: 'Start onboarding' }
          : { to: '/', label: 'Open your dashboard' };

    const items = useMemo(() => samplePortfolioItems(), []);

    const primaryCta = (
        <Button asChild size="lg" className="h-10 px-3.5 text-[14px] sm:h-9">
            <Link to={next.to}>
                {next.label}
                <ArrowRight data-icon="inline-end" />
            </Link>
        </Button>
    );

    return (
        <div className="landing-page min-h-svh bg-background">
            <header className="landing-header sticky top-0 z-30 bg-background">
                <div className="landing-header-inner mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 sm:px-6">
                    <Link to={signedIn ? '/home' : '/'} aria-label={`${APP_NAME} home`}>
                        <Logo />
                    </Link>
                    <nav aria-label="Homepage sections" className="landing-nav hidden items-center text-sm text-muted-foreground md:flex">
                        {SECTIONS.map((s) => (
                            <a key={s.id} href={`#${s.id}`} onClick={(e) => scrollToSection(e, s.id)}>
                                {s.label}
                            </a>
                        ))}
                    </nav>
                    <div className="landing-account-actions flex items-center gap-2">
                        {signedIn ? (
                            <>
                                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                                    <Link to={needsOnboarding ? '/onboarding' : '/'}>{needsOnboarding ? 'Start onboarding' : 'Dashboard'}</Link>
                                </Button>
                                <AccountMenu />
                            </>
                        ) : (
                            <>
                                <Button asChild variant="ghost">
                                    <Link to="/sign-in">Sign in</Link>
                                </Button>
                                <Button asChild>
                                    <Link to="/sign-up">Create account</Link>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                <HeaderTrain />
            </header>

            <main>
                {/* ---------- desktop: pitch and dashboard side by side; mobile: a single column ---------- */}
                <section className="relative isolate overflow-hidden">
                    <div aria-hidden className="absolute inset-0 -z-10 bg-(image:--bg-steamroom) bg-cover bg-center opacity-40" />
                    <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-b from-background/90 via-background/75 to-background" />
                    <RailwayAmbience variant="landing" />

                    <div className="landing-hero-grid mx-auto grid max-w-7xl items-center px-5 pt-9 pb-9 sm:px-6 sm:pt-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] lg:gap-12 lg:py-14 xl:gap-16">
                        <div className="landing-intro mx-auto w-full max-w-2xl text-center lg:mx-0 lg:max-w-none lg:text-left animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both motion-reduce:animate-none">
                            <h1 className="font-editorial text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[2.5rem]">Everything you own.<br /><span className="text-label">All in one portfolio.</span></h1>
                            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-pretty text-muted-foreground sm:text-base lg:mx-0">
                                Log or upload your physical assets, see what they’re worth today, and decide what to keep or sell. Your car, home, watches, cards, and tools—all accounted for.
                            </p>
                            <ul className="landing-capabilities" aria-label="What you can do with Gauge">
                                <li><PackagePlus /><span>Log or upload assets</span></li>
                                <li><Gauge /><span>See present-day values</span></li>
                                <li><Banknote /><span>Explore liquidation</span></li>
                                <li><FileDown /><span>Manage & export holdings</span></li>
                            </ul>
                            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                                {primaryCta}
                                {signedIn && !needsOnboarding ? (
                                    <AddAssetDialog>
                                        <Button variant="outline" size="lg" className="h-10 px-3.5 text-[14px] sm:h-9">Log or upload an asset</Button>
                                    </AddAssetDialog>
                                ) : (
                                    <Button asChild variant="outline" size="lg" className="h-10 px-3.5 text-[14px] sm:h-9">
                                        <Link to={next.to}>Log or upload an asset</Link>
                                    </Button>
                                )}
                            </div>
                            {signedIn ? (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Signed in as {profileQuery.data?.profile?.name ?? auth.displayName}.
                                    {auth.signOut && (
                                        <>
                                            {' '}
                                            <button type="button" onClick={() => auth.signOut?.()} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                Sign out
                                            </button>
                                        </>
                                    )}
                                </p>
                            ) : (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Already have an account?{' '}
                                    <Link to="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
                                        Sign in
                                    </Link>
                                </p>
                            )}
                        </div>

                        <div className="landing-preview-wrap min-w-0 pt-20 sm:pt-24 lg:pt-16 animate-in fade-in slide-in-from-bottom-3 delay-200 duration-700 fill-mode-both motion-reduce:animate-none">
                            <DashboardPreview items={items} />
                        </div>
                    </div>
                </section>

                {/* ---------- how it works ---------- */}
                <section id="how" className="landing-section relative isolate overflow-hidden border-t bg-card">
                    <RailwayAmbience variant="landing" className="landing-steam-how" />
                    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 lg:py-12">
                        <Reveal className="landing-how-heading">
                            <div className="max-w-2xl">
                                <h2 className="font-editorial text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">How {APP_NAME} works</h2>
                                <p className="mt-3 text-muted-foreground">
                                    From your first upload to your next sale. Gus helps you get your holdings in order, one stop at a time.
                                </p>
                            </div>
                            <div className="landing-gus-guide">
                                <p>I’ll help you<br />take stock.</p>
                                <Gus pose="calm" size={88} className="h-auto w-20 sm:w-[88px]" />
                            </div>
                        </Reveal>
                        <Reveal className="mt-8" delay={100}>
                            <FlowDiagram items={items} />
                        </Reveal>
                    </div>
                </section>

                {/* ---------- use cases ---------- */}
                <section id="use-cases" className="landing-section relative isolate overflow-hidden border-t bg-background">
                    <RailwayAmbience variant="landing" className="landing-steam-cases" />
                    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 lg:py-12">
                        <Reveal className="max-w-2xl">
                            <h2 className="font-editorial text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">For the things you keep. And the things you sell.</h2>
                            <p className="mt-3 text-muted-foreground">Keep a collection organized, prepare an estate, or turn unused assets into your next opportunity.</p>
                        </Reveal>
                        <div className="landing-use-cases mt-7 grid sm:grid-cols-2">
                            {USE_CASES.map((u, i) => (
                                <div key={u.title} className="landing-use-case">
                                    <Reveal delay={(i % 3) * 90}>
                                        <u.icon className="size-5 text-label" strokeWidth={1.75} />
                                        <h3 className="mt-3 font-editorial text-lg font-semibold tracking-[-0.01em]">{u.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{u.problem}</p>
                                        <p className="mt-3 text-sm leading-relaxed">{u.answer}</p>
                                    </Reveal>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ---------- closing ---------- */}
                <section className="relative isolate overflow-hidden bg-sidebar text-sidebar-foreground">
                    <div aria-hidden className="absolute inset-0 -z-10 bg-(image:--bg-steamroom) bg-cover bg-bottom opacity-80" />
                    <RailwayAmbience variant="landing" />
                    <Reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-5 px-5 py-10 sm:px-6 md:flex-row md:items-center">
                        <div>
                            <h2 className="font-editorial text-2xl font-semibold tracking-[-0.02em]">Start with one thing you own.</h2>
                            <p className="mt-2 max-w-lg text-sm text-sidebar-foreground/80">Upload a photo or enter the details. Build a portfolio you can value, manage, and export.</p>
                        </div>
                        <Button asChild size="lg" className="h-10 px-4">
                            <Link to={next.to}>
                                {next.label}
                                <ArrowRight data-icon="inline-end" />
                            </Link>
                        </Button>
                    </Reveal>
                </section>
            </main>

            <SiteFooter width="max-w-6xl" note="Values are estimates, not appraisals. Built at SBU Hacks." />
        </div>
    );
}
