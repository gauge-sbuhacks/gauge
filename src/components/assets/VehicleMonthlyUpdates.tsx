import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { OBSERVED_VALUE_TYPES, VALUE_TYPE_LABELS, type AssetRecord, type ObservedValueType } from '@shared/schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { useVehicleUpdates } from '@/hooks/usePortfolio.ts';
import { formatDate } from '@/lib/format.ts';

export function VehicleMonthlyUpdates({ asset }: { asset: AssetRecord }) {
    const { settings, updateNow } = useVehicleUpdates(asset.id);
    const state = asset.vehicleValueUpdates;
    const types = state?.valueTypes ?? [];
    const busy = settings.isPending || updateNow.isPending;
    const toggle = (type: ObservedValueType, enabled: boolean) => settings.mutate(enabled ? [...types, type] : types.filter((value) => value !== type), {
        onError: (error) => toast.error('Could not change monthly updates', { description: error.message })
    });
    return <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Monthly vehicle updates</h2>
            {types.length > 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => updateNow.mutate(undefined, {
                onSuccess: () => toast.success('Vehicle values refreshed'),
                onError: (error) => toast.error('Could not refresh vehicle values', { description: error.message })
            })}><RefreshCw className={updateNow.isPending ? 'animate-spin' : ''} />Refresh now</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Refresh selected values every month using VinAudit and your last recorded mileage. Each update is added to the history. Entering your own value turns off updates for that value type.</p>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
            {OBSERVED_VALUE_TYPES.map((type) => <div key={type} className="flex items-center gap-3">
                <Switch id={`monthly-${type}`} checked={types.includes(type)} disabled={busy || asset.isSample || asset.currency !== 'USD'} onCheckedChange={(checked) => toggle(type, checked)} />
                <Label htmlFor={`monthly-${type}`}>{VALUE_TYPE_LABELS[type]}</Label>
            </div>)}
        </div>
        {state?.lastRefreshedAt && <p className="text-xs text-muted-foreground">Last updated {formatDate(state.lastRefreshedAt.slice(0, 10))}{types.length > 0 && state.nextRefreshAt ? ` · ${state.lastError ? 'Retry' : 'Next update'} ${formatDate(state.nextRefreshAt.slice(0, 10))}` : ''}</p>}
        {types.length > 0 && !state?.lastRefreshedAt && state?.nextRefreshAt && <p className="text-xs text-muted-foreground">First automatic update due {formatDate(state.nextRefreshAt.slice(0, 10))}. You can also refresh now.</p>}
        {state?.lastError && <p role="status" className="text-xs text-destructive">{state.lastError}</p>}
    </section>;
}
