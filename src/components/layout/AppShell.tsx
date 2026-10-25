// the frame around every app page: a gunmetal top bar (logo, Dashboard and Assets in the middle,
// add + account on the right), the page, then the footer. on phones the two tabs drop to a second row.

import { NavLink, Outlet, useLocation } from 'react-router';
import { Boxes, LayoutDashboard, Plus } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { AccountMenu } from '@/components/layout/AccountMenu.tsx';
import { SiteFooter } from '@/components/layout/SiteFooter.tsx';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils.ts';

const NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/assets', label: 'Assets', icon: Boxes, end: false }
];

function NavTabs({ className }: { className?: string }) {
    const location = useLocation();
    return (
        <nav aria-label="Main" className={cn('grid grid-cols-2', className)}>
            {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => {
                        // /assets/new has its own button, so "Assets" doesn't light up for it
                        const active = isActive && !(to === '/assets' && location.pathname === '/assets/new');
                        return cn(
                            'relative flex items-center justify-center gap-2 px-6 text-sm font-medium transition-colors outline-none focus-visible:bg-sidebar-accent',
                            active ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground/70 hover:text-sidebar-accent-foreground',
                            // the brass underline marks where you are
                            active && 'after:absolute after:inset-x-4 after:bottom-0 after:h-0.5 after:rounded-full after:bg-sidebar-primary'
                        );
                    }}
                >
                    <Icon className="size-4" strokeWidth={1.75} />
                    {label}
                </NavLink>
            ))}
        </nav>
    );
}

export default function AppShell() {
    return (
        <div className="flex min-h-svh flex-col">
            <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
                <div className="mx-auto grid h-14 max-w-7xl grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-4 sm:px-6 lg:px-8">
                    <NavLink to="/home" aria-label="Home page" className="flex w-fit items-center text-sidebar-accent-foreground">
                        <Logo />
                    </NavLink>

                    <NavTabs className="hidden w-80 md:grid" />

                    <div className="col-start-3 flex items-center justify-end gap-2">
                        <Button asChild size="sm" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                            <NavLink to="/assets/new" aria-label="Add asset">
                                <Plus data-icon="inline-start" />
                                <span className="hidden sm:inline">Add asset</span>
                            </NavLink>
                        </Button>
                        <AccountMenu tone="dark" />
                    </div>
                </div>
                {/* phones: the two tabs get their own row, split evenly */}
                <NavTabs className="h-11 border-t border-sidebar-border md:hidden" />
            </header>

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>
            </main>

            <SiteFooter />
        </div>
    );
}
