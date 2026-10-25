// the signed-in person's menu: who they are, onboarding answers, theme, and sign out. the Setup page
// (/settings) is for the team checking keys, so it isn't linked here.
// "light" sits on the public pages, "dark" sits in the app's gunmetal top bar.

import { useNavigate } from 'react-router';
import { ChevronDown, ClipboardList, LayoutDashboard, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useProfile } from '@/hooks/useProfile.ts';
import { useTheme } from '@/lib/theme.ts';
import { cn } from '@/lib/utils.ts';

export function AccountMenu({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
    const auth = useAuthInfo();
    const navigate = useNavigate();
    const { data } = useProfile({ enabled: auth.status === 'signed-in' });
    const profile = data?.profile;
    const name = profile?.name ?? auth.displayName;
    const dark = tone === 'dark';
    const theme = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={dark ? 'ghost' : 'outline'}
                    size={dark ? 'sm' : 'default'}
                    aria-label={`Account menu for ${name}`}
                    className={cn(
                        'max-w-52',
                        dark && 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground'
                    )}
                >
                    <UserRound data-icon="inline-start" />
                    <span className={cn('truncate', dark && 'hidden lg:inline')}>{name}</span>
                    <ChevronDown data-icon="inline-end" className={dark ? 'opacity-60' : 'text-muted-foreground'} />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                    <div className="truncate text-sm font-medium text-foreground">{name}</div>
                    {auth.email && <div className="truncate text-xs text-muted-foreground">{auth.email}</div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profile ? (
                    <>
                        {!dark && (
                            <DropdownMenuItem onSelect={() => navigate('/')}>
                                <LayoutDashboard />
                                Dashboard
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => navigate('/onboarding?edit')}>
                            <ClipboardList />
                            Edit your answers
                        </DropdownMenuItem>
                    </>
                ) : (
                    <DropdownMenuItem onSelect={() => navigate('/onboarding')}>
                        <ClipboardList />
                        Start onboarding
                    </DropdownMenuItem>
                )}
                {/* the menu stays open, so the change is visible right away */}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); theme.toggle(); }}>
                    {theme.theme === 'dark' ? <Sun /> : <Moon />}
                    {theme.theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {auth.signOut ? (
                    <DropdownMenuItem onSelect={() => auth.signOut?.()}>
                        <LogOut />
                        Sign out
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Sign-in is off until Clerk keys are added.</DropdownMenuLabel>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
