// the signed-in person's menu on public pages: who they are, onboarding, the app, and sign out

import { useNavigate } from 'react-router';
import { ChevronDown, ClipboardList, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
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

export function AccountMenu() {
    const auth = useAuthInfo();
    const navigate = useNavigate();
    const { data } = useProfile({ enabled: auth.status === 'signed-in' });
    const profile = data?.profile;
    const name = profile?.name ?? auth.displayName;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="max-w-52">
                    <UserRound data-icon="inline-start" />
                    <span className="truncate">{name}</span>
                    <ChevronDown data-icon="inline-end" className="text-muted-foreground" />
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
                        <DropdownMenuItem onSelect={() => navigate('/')}>
                            <LayoutDashboard />
                            Dashboard
                        </DropdownMenuItem>
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
