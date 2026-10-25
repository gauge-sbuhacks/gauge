// the frame around every app page: the top bar (pressure badge logo, Dashboard and Assets in the
// middle, add + account on the right) sitting on a copper railway track, the page, then the footer. on phones
// the two tabs drop to a second row. the pipeworks background stays fixed behind everything.

import { NavLink, Outlet, useLocation } from 'react-router';
import { Boxes, LayoutDashboard, Plus } from 'lucide-react';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { Logo } from '@/components/common/Logo.tsx';
import { Backdrop } from '@/components/brand/Backdrop.tsx';
import { RailDivider } from '@/components/brand/Railway.tsx';
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
                        const adding = location.pathname === '/assets/new' || location.pathname.startsWith('/assets/review/');
                        const active = isActive && !(to === '/assets' && adding);
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
        <div className="relative isolate flex min-h-svh flex-col">
            {/* pipes frame the edges and the middle stays clear, so cards and numbers never sit on them */}
            <Backdrop />

            <header className="sticky top-0 z-30 bg-sidebar/95 text-sidebar-foreground shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                <div className="mx-auto grid h-14 max-w-7xl grid-cols-[1fr_auto_1fr] items-stretch gap-4 px-4 sm:px-6 lg:px-8">
                    <NavLink to="/home" aria-label="Home page" className="flex w-fit items-center text-sidebar-accent-foreground">
                        <Logo />
                    </NavLink>

                    <NavTabs className="hidden w-60 md:grid lg:w-80" />

                    <div className="col-start-3 flex items-center justify-end gap-2">
                        <AddAssetDialog>
                            <Button type="button" size="sm" className="h-9 px-3" aria-label="Add asset">
                                <Plus data-icon="inline-start" />
                                <span className="hidden sm:inline">Add asset</span>
                            </Button>
                        </AddAssetDialog>
                        <AccountMenu tone="dark" />
                    </div>
                </div>
                {/* phones: the two tabs get their own row, split evenly */}
                <NavTabs className="h-11 border-t border-sidebar-border md:hidden" />
                <RailDivider className="rail-header-track" />
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
