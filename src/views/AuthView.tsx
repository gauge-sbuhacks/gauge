// /sign-in and /sign-up. the forms are clerk's, so the social buttons (google, github, apple...)
// are whichever providers are switched on in the clerk dashboard; nothing here lists them.

import { Link, Navigate } from 'react-router';
import { SignIn, SignUp } from '@clerk/react';
import { ArrowLeft, FileDown, History, PackagePlus } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { SiteFooter } from '@/components/layout/SiteFooter.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { APP_NAME } from '@/config.ts';

const POINTS = [
    { icon: PackagePlus, text: 'Record what you own, with serials, receipts, and where it is kept.' },
    { icon: History, text: 'Keep every value with its date, so history builds up on its own.' },
    { icon: FileDown, text: 'Export an inventory with current values and purchase records.' }
];

export default function AuthView({ mode }: { mode: 'sign-in' | 'sign-up' }) {
    const auth = useAuthInfo();
    // without clerk keys there is nothing to sign in to; the app already runs as the local dev user
    if (auth.mode === 'dev') return <Navigate replace to="/" />;

    return (
        <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
                <Link to="/" className="w-fit text-sidebar-accent-foreground">
                    <Logo />
                </Link>
                <div className="max-w-md animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both motion-reduce:animate-none">
                    <p className="text-3xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
                        {mode === 'sign-up' ? 'Start an inventory you can actually use.' : 'Welcome back.'}
                    </p>
                    <ul className="mt-8 space-y-4">
                        {POINTS.map((p) => (
                            <li key={p.text} className="flex gap-3 text-sm leading-relaxed">
                                <p.icon className="mt-0.5 size-4 shrink-0 text-sidebar-primary" strokeWidth={1.75} />
                                {p.text}
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="text-xs text-sidebar-foreground/60">Values are estimates, not appraisals.</p>
            </aside>

            <main className="flex flex-col px-6 py-6">
                <div className="flex items-center justify-between">
                    <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                        <ArrowLeft className="size-4" />
                        Back to {APP_NAME}
                    </Link>
                    <Link to="/" className="lg:hidden">
                        <Logo />
                    </Link>
                </div>
                <div className="flex flex-1 items-center justify-center py-10">
                    <div className="w-full max-w-[25rem] animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both motion-reduce:animate-none">
                        {mode === 'sign-in' ? <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" /> : <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />}
                    </div>
                </div>
                <SiteFooter width="max-w-none" className="-mx-6 -mb-6 border-t-0" />
            </main>
        </div>
    );
}
