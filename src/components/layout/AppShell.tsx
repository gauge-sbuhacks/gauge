// the frame around every page: gunmetal sidebar on desktop, a top bar + slide-out menu on phones

import { useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Boxes, LayoutDashboard, LogOut, Menu, Plus, Settings2, UserRound } from 'lucide-react';
import { Logo } from '@/components/common/Logo.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { cn } from '@/lib/utils.ts';

const NAV = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/assets', label: 'Assets', icon: Boxes, end: false },
    { to: '/settings', label: 'Setup', icon: Settings2, end: false }
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
    const location = useLocation();
    return (
        <nav className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) => {
                        // /assets/new is its own button below, so don't light up "Assets" for it
                        const active = isActive && !(to === '/assets' && location.pathname === '/assets/new');
                        return cn(
                            'relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                        );
                    }}
                >
                    {({ isActive }) => (
                        <>
                            {isActive && !(to === '/assets' && location.pathname === '/assets/new') && (
                                <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-sidebar-primary" />
                            )}
                            <Icon className="size-4" strokeWidth={1.75} />
                            {label}
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
    const auth = useAuthInfo();
    return (
        <div className="flex h-full flex-col gap-6 p-4">
            <div className="px-2 pt-1">
                <Logo className="text-sidebar-accent-foreground" />
            </div>

            <Button asChild className="justify-start bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90">
                <NavLink to="/assets/new" onClick={onNavigate}>
                    <Plus data-icon="inline-start" />
                    Add asset
                </NavLink>
            </Button>

            <NavItems onNavigate={onNavigate} />

            <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-sm">
                <div className="flex items-center gap-2 text-sidebar-accent-foreground">
                    <UserRound className="size-4 shrink-0 opacity-70" />
                    <span className="truncate">{auth.displayName}</span>
                </div>
                {auth.mode === 'dev' ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-sidebar-foreground/70">Sign-in is off until Clerk keys are added. See Setup.</p>
                ) : (
                    <button
                        type="button"
                        onClick={() => auth.signOut?.()}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-sidebar-foreground/80 hover:text-sidebar-accent-foreground"
                    >
                        <LogOut className="size-3.5" />
                        Sign out
                    </button>
                )}
            </div>
        </div>
    );
}

export default function AppShell() {
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
            {/* desktop sidebar */}
            <aside className="sticky top-0 hidden h-svh bg-sidebar text-sidebar-foreground lg:block">
                <SidebarBody />
            </aside>

            {/* phone / tablet top bar */}
            <header className="sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 py-2.5 text-sidebar-foreground lg:hidden">
                <Logo className="text-sidebar-accent-foreground" />
                <div className="flex items-center gap-1">
                    <Button asChild size="icon" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" aria-label="Add asset">
                        <NavLink to="/assets/new">
                            <Plus />
                        </NavLink>
                    </Button>
                    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                        <SheetTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Open menu">
                                <Menu />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
                            <SheetTitle className="sr-only">Menu</SheetTitle>
                            <SidebarBody onNavigate={() => setMenuOpen(false)} />
                        </SheetContent>
                    </Sheet>
                </div>
            </header>

            <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                <div className="mx-auto max-w-7xl">
                    <Outlet />
                </div>
            </main>
            {/* new pages start at the top; back/forward returns to where you were */}
            <ScrollRestoration />

        </div>
    );
}
