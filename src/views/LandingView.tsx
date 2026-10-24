// the public product page. signed-out visitors see it at "/", and anyone can open it at /home.

import { useMemo, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Flame, Gem, Landmark, ShieldCheck, Truck, Wrench, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { PressureBreakdown, PressureGauge } from '@/components/charts/PressureGauge.tsx';
import { AssetValuesDiagram, FlowDiagram } from '@/components/landing/Diagrams.tsx';
import { Reveal } from '@/components/landing/Reveal.tsx';
import { AccountMenu } from '@/components/layout/AccountMenu.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useProfile } from '@/hooks/useProfile.ts';
import { APP_NAME } from '@/config.ts';
import { pressureFor } from '@/lib/portfolio.ts';
import { samplePortfolioItems } from '@/lib/samplePortfolio.ts';

const SECTIONS = [
    { id: 'how', label: 'How it works' },
    { id: 'pressure', label: 'Pressure' },
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
        icon: Flame,
        title: 'After a fire, flood, or break-in',
        problem: 'Insurers ask for a list of everything you lost, with values and proof. Most people rebuild it from memory, weeks later.',
        answer: 'A dated inventory with serials, purchase records, and replacement costs, ready to export as a PDF.'
    },
    {
        icon: ShieldCheck,
        title: 'Checking your coverage',
        problem: 'Standard policies cap jewelry, watches, and collectibles unless they are scheduled. Being underinsured is easy to miss.',
        answer: 'The pressure gauge shows how much value is uninsured or missing proof, and which items to fix first.'
    },
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
        icon: Truck,
        title: 'Moving or splitting a household',
        problem: 'Mover valuation coverage and property settlements both start with a list of what you own.',
        answer: 'A room-by-room inventory you can filter by location and export in a minute.'
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
    const pressure = useMemo(() => pressureFor(items), [items]);
    const car = items.find((i) => i.asset.category === 'vehicle') ?? items[0];

    const primaryCta = (
        <Button asChild size="lg" className="h-10 px-4">
            <Link to={next.to}>
                {next.label}
                <ArrowRight data-icon="inline-end" />
            </Link>
        </Button>
    );

    return (
        <div className="min-h-svh bg-background">
            <header className="sticky top-0 z-30 border-b bg-background">
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
                    <Link to={signedIn ? '/home' : '/'} aria-label={`${APP_NAME} home`}>
                        <Logo />
                    </Link>
                    <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
                        {SECTIONS.map((s) => (
                            <a key={s.id} href={`#${s.id}`} onClick={(e) => scrollToSection(e, s.id)} className="transition-colors hover:text-foreground">
                                {s.label}
                            </a>
                        ))}
                    </nav>
                    <div className="flex items-center gap-2">
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
            </header>

            <main>
                {/* ---------- intro ---------- */}
                <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:py-24">
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both motion-reduce:animate-none">
                        <h1 className="max-w-xl text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl">Know what everything you own is worth, and be able to prove it.</h1>
                        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
                            {APP_NAME} is an inventory for the physical things in your life: cars, homes, watches, cards, tools. Record what you paid and what each item is worth today, and it
                            becomes a portfolio with value history, coverage gaps, and a claim-ready export.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            {primaryCta}
                            <Button asChild variant="outline" size="lg" className="h-10 px-4">
                                <a href="#how" onClick={(e) => scrollToSection(e, 'how')}>
                                    See how it works
                                </a>
                            </Button>
                        </div>
                        {signedIn ? (
                            <p className="mt-6 text-sm text-muted-foreground">
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
                            <p className="mt-6 text-sm text-muted-foreground">
                                Already have an account?{' '}
                                <Link to="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
                                    Sign in
                                </Link>
                            </p>
                        )}
                    </div>
                    <div className="animate-in fade-in slide-in-from-bottom-3 delay-150 duration-700 fill-mode-both motion-reduce:animate-none">
                        {car && <AssetValuesDiagram item={car} />}
                    </div>
                </section>

                {/* ---------- how it works ---------- */}
                <section id="how" className="scroll-mt-14 border-t bg-card">
                    <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
                        <Reveal className="max-w-2xl">
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How {APP_NAME} works</h2>
                            <p className="mt-3 text-muted-foreground">
                                Four steps, all by hand for now. Lookups like the free NHTSA VIN decoder and home value estimates suggest details, and nothing is saved until you confirm it.
                            </p>
                        </Reveal>
                        <Reveal className="mt-12" delay={100}>
                            <FlowDiagram items={items} />
                        </Reveal>
                    </div>
                </section>

                {/* ---------- pressure ---------- */}
                <section id="pressure" className="scroll-mt-14 border-t">
                    <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
                        <Reveal>
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">A pressure reading for what you couldn't prove after a loss</h2>
                            <p className="mt-4 leading-relaxed text-muted-foreground">
                                Pressure is the share of your value that is uninsured, or insured but missing proof: no current value, or no serial number and no purchase record. It is
                                weighted by replacement cost, so a missing serial on a watch matters more than one on a chair.
                            </p>
                            <ul className="mt-6 space-y-3 text-sm">
                                <li className="flex gap-3">
                                    <span className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-good" />
                                    <span>
                                        <span className="font-medium">Insured and documented.</span> <span className="text-muted-foreground">Covered, with a value and proof of ownership.</span>
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-warning" />
                                    <span>
                                        <span className="font-medium">Insured, missing proof.</span> <span className="text-muted-foreground">Covered on paper, hard to claim in practice.</span>
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="mt-1.5 size-2 shrink-0 rounded-[2px] bg-critical" />
                                    <span>
                                        <span className="font-medium">Not insured.</span> <span className="text-muted-foreground">Gone for good if something happens.</span>
                                    </span>
                                </li>
                            </ul>
                        </Reveal>
                        <Reveal delay={120}>
                            <figure className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
                                <PressureGauge pressure={pressure} />
                                <div className="mt-6 border-t pt-5">
                                    <PressureBreakdown pressure={pressure} />
                                </div>
                                <figcaption className="mt-5 text-xs text-muted-foreground">Reading for the {items.length}-item test portfolio you can load after signing up.</figcaption>
                            </figure>
                        </Reveal>
                    </div>
                </section>

                {/* ---------- use cases ---------- */}
                <section id="use-cases" className="scroll-mt-14 border-t bg-card">
                    <div className="mx-auto max-w-6xl px-6 py-16 lg:py-20">
                        <Reveal className="max-w-2xl">
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where it helps most</h2>
                            <p className="mt-3 text-muted-foreground">The moments when knowing exactly what you own, and what it is worth, stops being a nice-to-have.</p>
                        </Reveal>
                        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
                            {USE_CASES.map((u, i) => (
                                <div key={u.title} className="bg-card p-6">
                                    <Reveal delay={(i % 3) * 90}>
                                        <u.icon className="size-5 text-foreground/80" strokeWidth={1.75} />
                                        <h3 className="mt-4 font-semibold">{u.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{u.problem}</p>
                                        <p className="mt-3 text-sm leading-relaxed">{u.answer}</p>
                                    </Reveal>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ---------- closing ---------- */}
                <section className="bg-sidebar text-sidebar-foreground">
                    <Reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight text-sidebar-accent-foreground">Start with one thing you own.</h2>
                            <p className="mt-2 max-w-lg text-sm text-sidebar-foreground/80">It takes about a minute. Or load the test portfolio first and look around.</p>
                        </div>
                        <Button asChild size="lg" className="h-10 bg-sidebar-primary px-4 text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                            <Link to={next.to}>
                                {next.label}
                                <ArrowRight data-icon="inline-end" />
                            </Link>
                        </Button>
                    </Reveal>
                </section>
            </main>

            <footer className="border-t">
                <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <Logo className="text-foreground" />
                    <p>Values are estimates, not appraisals. Built at SBU Hacks.</p>
                </div>
            </footer>
        </div>
    );
}
