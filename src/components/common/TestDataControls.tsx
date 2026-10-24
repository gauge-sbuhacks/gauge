// the "test data" button: loads a 10-item sample portfolio (2020 Cadillac XT6, 89 Carnation Road, ...)
// or removes it. only sample items are touched; anything you typed in yourself stays put.

import { FlaskConical, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.tsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu.tsx';
import { useLoadSample, usePortfolio, useRemoveSample } from '@/hooks/usePortfolio.ts';

export function useTestData() {
    const { items } = usePortfolio();
    const load = useLoadSample();
    const remove = useRemoveSample();
    const sampleCount = items?.filter((i) => i.asset.isSample).length ?? 0;

    const loadSample = () =>
        load.mutate(undefined, {
            onSuccess: (r) => toast.success(`Loaded ${r.added} test assets`, { description: 'They are marked "Test data" and can be removed any time.' }),
            onError: (err) => toast.error("Couldn't load test data", { description: err.message })
        });

    const removeSample = () =>
        remove.mutate(undefined, {
            onSuccess: (r) => toast.success(`Removed ${r.removed} test asset${r.removed === 1 ? '' : 's'}`),
            onError: (err) => toast.error("Couldn't remove test data", { description: err.message })
        });

    return { sampleCount, loadSample, removeSample, busy: load.isPending || remove.isPending };
}

export function TestDataMenu({ size = 'default' }: { size?: 'sm' | 'default' }) {
    const { sampleCount, loadSample, removeSample, busy } = useTestData();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size={size} disabled={busy}>
                    <FlaskConical data-icon="inline-start" />
                    Test data
                    {sampleCount > 0 && <span className="rounded bg-brass-soft px-1 text-[11px] font-semibold text-brass">{sampleCount}</span>}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    10 sample belongings with a few years of made-up value history.
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={loadSample}>
                    {sampleCount > 0 ? <RotateCcw /> : <FlaskConical />}
                    {sampleCount > 0 ? 'Reset test portfolio' : 'Load test portfolio'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" disabled={sampleCount === 0} onSelect={removeSample}>
                    <Trash2 />
                    Remove test data
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
