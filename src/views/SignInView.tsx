// shown to signed-out visitors when clerk is on. rendered outside the router, so no router hooks here

import { SignIn } from '@clerk/react';
import { LogoMark } from '@/components/common/Logo.tsx';
import { APP_NAME, APP_TAGLINE } from '@/config.ts';

export default function SignInView() {
    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
                <div className="flex items-center gap-2 text-sidebar-accent-foreground">
                    <LogoMark className="text-sidebar-primary" />
                    <span className="text-lg font-semibold">{APP_NAME}</span>
                </div>
                <div>
                    <p className="max-w-md text-3xl leading-tight font-semibold text-sidebar-accent-foreground">{APP_TAGLINE}.</p>
                    <p className="mt-3 max-w-md text-sm text-sidebar-foreground/80">
                        Record what you own, what you paid, and what it is worth today. Keep a claim-ready inventory for when it matters.
                    </p>
                </div>
                <p className="text-xs text-sidebar-foreground/60">Values are estimates, not appraisals.</p>
            </div>
            <div className="flex items-center justify-center p-6">
                <SignIn routing="hash" />
            </div>
        </div>
    );
}
