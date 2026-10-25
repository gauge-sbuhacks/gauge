// one asset's value history: a step chart per value type (with cost basis as a reference line)
// and the full table of observations underneath, newest first.

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { representativeCents } from '@shared/money.ts';
import { CONDITION_LABELS, OBSERVED_VALUE_TYPES, VALUATION_SOURCE_LABELS, VALUE_TYPE_SHORT, type ObservedValueType, type ValuationRecord } from '@shared/schemas.ts';
import { HistoryChart } from '@/components/charts/HistoryChart.tsx';
import { Segmented } from '@/components/common/Segmented.tsx';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { useDeleteValuation } from '@/hooks/usePortfolio.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import { assetHistory, type PortfolioItem } from '@/lib/portfolio.ts';

function amountText(v: ValuationRecord): string {
    if (v.amountCents != null && v.lowCents != null && v.highCents != null) {
        return `${formatMoney(v.amountCents)} (${formatMoney(v.lowCents)} to ${formatMoney(v.highCents)})`;
    }
    if (v.amountCents != null) return formatMoney(v.amountCents);
    if (v.lowCents != null && v.highCents != null) return `${formatMoney(v.lowCents)} to ${formatMoney(v.highCents)}`;
    return 'Not entered';
}

export function ValuationHistory({ item }: { item: PortfolioItem }) {
    const withData = OBSERVED_VALUE_TYPES.filter((t) => item.latest[t] != null);
    const [selectedType, setType] = useState<ObservedValueType>(withData[0] ?? 'fair_market');
    const type = withData.includes(selectedType) ? selectedType : withData[0] ?? 'fair_market';
    const [pendingDelete, setPendingDelete] = useState<ValuationRecord | null>(null);
    const del = useDeleteValuation(item.asset.id);

    const points = assetHistory(item, type);
    const rows = [...item.valuations].reverse();
    const cost = item.asset.purchasePriceCents;
    const rangeNote = item.latest[type] && item.latest[type]!.amountCents == null && representativeCents(item.latest[type]!) != null;

    const confirmDelete = () => {
        if (!pendingDelete) return;
        del.mutate(pendingDelete.id, {
            onSuccess: () => toast.success('Value removed from the history'),
            onError: (err) => toast.error("Couldn't remove it", { description: err.message })
        });
        setPendingDelete(null);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {withData.length > 1 && <Segmented
                    size="sm"
                    label="Value type"
                    value={type}
                    onChange={setType}
                    options={withData.map((t) => ({ value: t, label: VALUE_TYPE_SHORT[t] }))}
                />}
                {cost != null && <span className="text-xs text-muted-foreground">Dashed line: cost basis {formatMoney(cost)}</span>}
            </div>

            <p className="text-xs text-muted-foreground">Recorded estimates. The line holds each value until your next entry.</p>
            <HistoryChart points={points} baseline="auto" referenceCents={cost} referenceLabel="Cost basis" height={220} />
            {rangeNote && <p className="text-xs text-muted-foreground">Ranges are charted at their midpoint.</p>}
            {item.valuations.filter(v => v.valueType === type).length === 1 && <p className="text-xs text-muted-foreground">One recorded value so far. Record another later to see how it moves.</p>}

            {rows.length > 0 && (
                <details className="rounded-lg border"><summary className="cursor-pointer px-3 py-3 text-sm font-medium">View entries ({rows.length})</summary>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="pl-3">Date</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Value</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead className="hidden md:table-cell">Notes</TableHead>
                                <TableHead className="w-10 pr-3">
                                    <span className="sr-only">Remove</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((v) => (
                                <TableRow key={v.id}>
                                    <TableCell className="pl-3 whitespace-nowrap">{formatDate(v.observedAt)}</TableCell>
                                    <TableCell className="whitespace-nowrap">{VALUE_TYPE_SHORT[v.valueType]}</TableCell>
                                    <TableCell className="text-right whitespace-nowrap tabular-nums">{amountText(v)}</TableCell>
                                    <TableCell className="whitespace-nowrap">
                                        {v.sourceName ?? VALUATION_SOURCE_LABELS[v.source]}
                                        {v.conditionAssumption && <div className="text-xs text-muted-foreground">Assumes {CONDITION_LABELS[v.conditionAssumption].toLowerCase()}</div>}
                                    </TableCell>
                                    <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell" title={v.notes ?? undefined}>
                                        {v.notes}
                                    </TableCell>
                                    <TableCell className="pr-3">
                                        <Button size="icon-sm" variant="ghost" onClick={() => setPendingDelete(v)} aria-label={`Remove the ${formatDate(v.observedAt)} value`}>
                                            <Trash2 />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div></details>
            )}

            <AlertDialog open={pendingDelete != null} onOpenChange={(o) => !o && setPendingDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove this value?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingDelete && `${VALUE_TYPE_SHORT[pendingDelete.valueType]} of ${amountText(pendingDelete)} from ${formatDate(pendingDelete.observedAt)}. `}
                            Use this to fix a typo. It can't be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={confirmDelete}>
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
