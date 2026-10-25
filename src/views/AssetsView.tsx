// the asset list: search, filters, sorting, totals, and export. filters live in the url
// so the back button and shared links keep them.

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FileSpreadsheet, FileText, Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIES, usesCommonField } from '@shared/categories.ts';
import { CONDITION_LABELS, VALUE_TYPE_LABELS, VALUE_TYPE_SHORT, VALUE_TYPES, type ValueType } from '@shared/schemas.ts';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { CompletenessRing } from '@/components/common/CompletenessRing.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { GainLoss, MoneyValue, NotEntered } from '@/components/common/ValueDisplay.tsx';
import { EmptyState, PageHeader } from '@/components/layout/PageHeader.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { AddAssetDialog } from '@/components/assets/AddAssetDialog.tsx';
import { SellAssetButton } from '@/components/assets/SellAssetButton.tsx';
import { usePortfolio } from '@/hooks/usePortfolio.ts';
import { downloadCsv } from '@/lib/export/csv.ts';
import { formatAge, formatPercent } from '@/lib/format.ts';
import { distinctLocations, itemGain, latestOf, searchTextOf, totalsFor, valueOf } from '@/lib/portfolio.ts';
import { cn } from '@/lib/utils.ts';

type SortKey = 'name' | 'category' | 'location' | 'value' | 'cost' | 'gain' | 'record' | 'updated';
type Status = 'all' | 'incomplete' | 'missing_value' | 'sample';

const STATUS_LABELS: Record<Status, string> = {
    all: 'Any status',
    incomplete: 'Incomplete records',
    missing_value: 'No current value',
    sample: 'Test data only'
};

// "not entered" always sorts last, whichever direction you sort
function compareNullable(a: number | null, b: number | null, sign: number): number {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * sign;
}

function SortHead({
    k,
    sort,
    dir,
    onSort,
    children,
    className
}: {
    k: SortKey;
    sort: SortKey;
    dir: 'asc' | 'desc';
    onSort: (k: SortKey) => void;
    children: ReactNode;
    className?: string;
}) {
    const active = sort === k;
    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    const right = className?.includes('text-right');
    return (
        <TableHead className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button
                type="button"
                onClick={() => onSort(k)}
                className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground', right && 'flex-row-reverse')}
            >
                {children}
                <Icon className={cn('size-3.5', !active && 'opacity-40')} />
            </button>
        </TableHead>
    );
}


export default function AssetsView() {
    const { items, isLoading, error, refetch } = usePortfolio();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const auth = useAuthInfo();
    const [exporting, setExporting] = useState(false);

    const q = params.get('q') ?? '';
    const cat = params.get('cat') ?? 'all';
    const loc = params.get('loc') ?? 'all';
    const status = (params.get('status') ?? 'all') as Status;
    const missing = (VALUE_TYPES as readonly string[]).includes(params.get('missing') ?? '') ? (params.get('missing') as ValueType) : null;
    const valueType = (VALUE_TYPES as readonly string[]).includes(params.get('view') ?? '') ? (params.get('view') as ValueType) : 'fair_market';
    const sort = (params.get('sort') ?? 'value') as SortKey;
    const dir = params.get('dir') === 'asc' ? 'asc' : 'desc';

    const setParam = (key: string, value: string | null) => {
        const next = new URLSearchParams(params);
        if (value == null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
        setParams(next, { replace: true });
    };

    const toggleSort = (key: SortKey) => {
        const next = new URLSearchParams(params);
        if (sort === key) next.set('dir', dir === 'asc' ? 'desc' : 'asc');
        else {
            next.set('sort', key);
            // text columns start A to Z, number columns start biggest first
            next.set('dir', ['name', 'category', 'location'].includes(key) ? 'asc' : 'desc');
        }
        setParams(next, { replace: true });
    };

    const locations = useMemo(() => distinctLocations(items ?? []), [items]);
    const categoriesPresent = useMemo(() => new Set((items ?? []).map((i) => i.asset.category)), [items]);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        const rows = (items ?? []).filter((i) => {
            if (needle && !searchTextOf(i).includes(needle)) return false;
            if (cat !== 'all' && i.asset.category !== cat) return false;
            if (loc !== 'all' && (i.asset.location ?? '') !== loc) return false;
            if (missing && valueOf(i, missing) != null) return false;
            switch (status) {
                case 'incomplete':
                    return i.done < i.total;
                case 'missing_value':
                    return !i.latest.fair_market && !i.latest.liquidation;
                case 'sample':
                    return i.asset.isSample;
                default:
                    return true;
            }
        });

        const sign = dir === 'asc' ? 1 : -1;
        rows.sort((a, b) => {
            let r = 0;
            switch (sort) {
                case 'name':
                    r = a.asset.name.localeCompare(b.asset.name);
                    break;
                case 'category':
                    r = a.category.label.localeCompare(b.category.label);
                    break;
                case 'location':
                    r = (a.asset.location ?? '￿').localeCompare(b.asset.location ?? '￿');
                    break;
                case 'value':
                    return compareNullable(valueOf(a, valueType), valueOf(b, valueType), sign);
                case 'cost':
                    return compareNullable(a.asset.purchasePriceCents, b.asset.purchasePriceCents, sign);
                case 'gain':
                    return compareNullable(itemGain(a)?.gainCents ?? null, itemGain(b)?.gainCents ?? null, sign);
                case 'record':
                    r = a.done / a.total - b.done / b.total;
                    break;
                case 'updated':
                    r = a.asset.updatedAt.localeCompare(b.asset.updatedAt);
                    break;
            }
            return r * sign;
        });
        return rows;
    }, [items, q, cat, loc, status, missing, sort, dir, valueType]);

    const totals = useMemo(() => totalsFor(filtered, valueType), [filtered, valueType]);
    const costTotals = useMemo(() => totalsFor(filtered, 'cost_basis'), [filtered]);
    const filtersOn = q !== '' || cat !== 'all' || loc !== 'all' || status !== 'all' || missing != null;

    const exportCsv = () => {
        downloadCsv(filtered);
        toast.success(`Exported ${filtered.length} asset${filtered.length === 1 ? '' : 's'} to CSV`);
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            // the pdf library is big, so it only loads when someone actually exports
            const { downloadInventoryPdf } = await import('@/lib/export/pdf.tsx');
            await downloadInventoryPdf(filtered, { ownerName: auth.displayName, filtered: filtersOn });
            toast.success('Inventory PDF downloaded');
        } catch (err) {
            toast.error("Couldn't build the PDF", { description: err instanceof Error ? err.message : undefined });
        } finally {
            setExporting(false);
        }
    };

    if (isLoading) return <LoadingBlock label="Loading assets" />;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;

    const sortProps = { sort, dir, onSort: toggleSort } as const;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Assets"
                description={items && items.length > 0 ? `${items.length} total${filtersOn ? `, ${filtered.length} shown` : ''}` : undefined}
                actions={
                    <>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" disabled={filtered.length === 0 || exporting}>
                                    <Download data-icon="inline-start" />
                                    {exporting ? 'Building PDF' : 'Export'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Exports the {filtered.length} asset{filtered.length === 1 ? '' : 's'} shown
                                </DropdownMenuLabel>
                                <DropdownMenuItem onSelect={exportCsv}>
                                    <FileSpreadsheet />
                                    Spreadsheet (CSV)
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={exportPdf}>
                                    <FileText />
                                    Inventory record (PDF)
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <AddAssetDialog>
                            <Button type="button">
                                <Plus data-icon="inline-start" />
                                Add asset
                            </Button>
                        </AddAssetDialog>
                    </>
                }
            />

            {/* filter row */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search name, brand, serial..." className="bg-card pl-8" aria-label="Search assets" />
                </div>
                <Select value={cat} onValueChange={(v) => setParam('cat', v)}>
                    <SelectTrigger className="bg-card" aria-label="Category">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {CATEGORIES.filter((c) => categoriesPresent.has(c.id)).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={loc} onValueChange={(v) => setParam('loc', v)}>
                    <SelectTrigger className="bg-card" aria-label="Location">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All locations</SelectItem>
                        {locations.map((l) => (
                            <SelectItem key={l} value={l}>
                                {l}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setParam('status', v)}>
                    <SelectTrigger className="bg-card" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                            <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={valueType} onValueChange={(v) => setParam('view', v === 'fair_market' ? null : v)}>
                    <SelectTrigger className="bg-card" aria-label="Value column">
                        <span className="text-muted-foreground">Value:</span>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {VALUE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                                {VALUE_TYPE_SHORT[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {missing && (
                    <Badge variant="outline" className="h-8 gap-1 rounded-lg bg-card px-2.5">
                        Missing {VALUE_TYPE_SHORT[missing].toLowerCase()}
                        <button type="button" onClick={() => setParam('missing', null)} aria-label="Clear missing filter">
                            <X className="size-3.5" />
                        </button>
                    </Badge>
                )}
                {filtersOn && (
                    <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                        Clear filters
                    </Button>
                )}
            </div>

            {!items || items.length === 0 ? (
                <EmptyState
                    title="No assets yet"
                    description="Add something you own, or load the test data from the button above."
                    actions={
                        <AddAssetDialog>
                            <Button type="button">
                                <Plus data-icon="inline-start" />
                                Add an asset
                            </Button>
                        </AddAssetDialog>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState title="Nothing matches" description="Try a different search or clear the filters." />
            ) : (
                <>
                    {/* desktop table */}
                    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <SortHead {...sortProps} k="name" className="pl-4">Asset</SortHead>
                                    <SortHead {...sortProps} k="location" className="hidden lg:table-cell">Location</SortHead>
                                    <SortHead {...sortProps} k="value" className="text-right">
                                        {VALUE_TYPE_SHORT[valueType]}
                                    </SortHead>
                                    {valueType !== 'cost_basis' && (
                                        <SortHead {...sortProps} k="cost" className="hidden text-right xl:table-cell">
                                            Cost basis
                                        </SortHead>
                                    )}
                                    <SortHead {...sortProps} k="gain" className="text-right">Gain / loss</SortHead>
                                    <TableHead className="hidden text-right lg:table-cell">Share</TableHead>
                                    <SortHead {...sortProps} k="record">Record</SortHead>
                                    <TableHead className="pr-4 text-right">Sell</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((item) => {
                                    const { asset } = item;
                                    const value = valueOf(item, valueType);
                                    const latest = latestOf(item, valueType);
                                    const gain = itemGain(item);
                                    const share = value != null && totals.totalCents ? value / totals.totalCents : null;
                                    return (
                                        <TableRow key={asset.id} className="cursor-pointer" onClick={() => navigate(`/assets/${asset.id}`)}>
                                            <TableCell className="w-full max-w-0 pl-4">
                                                <div className="flex items-center gap-3">
                                                    <CategoryBadgeIcon id={asset.category} />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <Link to={`/assets/${asset.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:underline">
                                                                {asset.name}
                                                            </Link>
                                                            {asset.isSample && (
                                                                <Badge variant="outline" className="shrink-0 border-brass/40 bg-brass-soft text-[10px] text-brass">
                                                                    Test data
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="truncate text-xs text-muted-foreground">
                                                            {item.category.singular}
                                                            {asset.condition && usesCommonField(asset.category, 'condition') && ` · ${CONDITION_LABELS[asset.condition]}`}
                                                            {item.identifier && ` · ${item.identifier.value}`}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                                                {asset.category === 'property' ? <span className="text-xs">n/a</span> : asset.location ?? <NotEntered />}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <MoneyValue cents={value} />
                                                {latest && <div className="text-xs text-muted-foreground">{formatAge(latest.observedAt)}</div>}
                                            </TableCell>
                                            {valueType !== 'cost_basis' && (
                                                <TableCell className="hidden text-right xl:table-cell">
                                                    <MoneyValue cents={asset.purchasePriceCents} />
                                                </TableCell>
                                            )}
                                            <TableCell className="text-right">
                                                {gain ? <GainLoss cents={gain.gainCents} ratio={gain.ratio} className="justify-end text-xs" /> : <NotEntered className="text-xs" label="n/a" />}
                                            </TableCell>
                                            <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                                                {share != null ? formatPercent(share) : ''}
                                            </TableCell>
                                            <TableCell>
                                                <CompletenessRing done={item.done} total={item.total} />
                                            </TableCell>
                                            <TableCell className="pr-4 text-right"><SellAssetButton id={asset.id}/></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="hover:bg-transparent">
                                    <TableCell className="pl-4 font-medium">
                                        Total{filtersOn ? ` of ${filtered.length} shown` : ''}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell" />
                                    <TableCell className="text-right">
                                        <div className="font-semibold tabular-nums">
                                            <MoneyValue cents={totals.counted ? totals.totalCents : null} />
                                        </div>
                                        <div className="text-xs font-normal text-muted-foreground">
                                            on {totals.counted} of {totals.of}
                                        </div>
                                    </TableCell>
                                    {valueType !== 'cost_basis' && (
                                        <TableCell className="hidden text-right xl:table-cell">
                                            <div className="tabular-nums">
                                                <MoneyValue cents={costTotals.counted ? costTotals.totalCents : null} />
                                            </div>
                                            <div className="text-xs font-normal text-muted-foreground">
                                                on {costTotals.counted} of {costTotals.of}
                                            </div>
                                        </TableCell>
                                    )}
                                    <TableCell colSpan={4} />
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>

                    {/* phone cards */}
                    <ul className="space-y-2 md:hidden">
                        {filtered.map((item) => {
                            const value = valueOf(item, valueType);
                            const gain = itemGain(item);
                            return (
                                <li key={item.asset.id}>
                                    <Link to={`/assets/${item.asset.id}`} className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                                        <CategoryBadgeIcon id={item.asset.category} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">{item.asset.name}</div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <CompletenessRing done={item.done} total={item.total} size={16} />
                                                {item.asset.isSample && <span className="text-brass">Test data</span>}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right text-sm">
                                            <div>
                                                <MoneyValue cents={value} />
                                            </div>
                                            {gain && <GainLoss cents={gain.gainCents} className="text-xs" showIcon={false} />}
                                        </div>
                                    </Link>
                                    <div className="mt-2 flex justify-end px-1"><SellAssetButton id={item.asset.id}/></div>
                                </li>
                            );
                        })}
                        <li className="flex justify-between px-1 pt-1 text-sm">
                            <span className="text-muted-foreground">
                                {VALUE_TYPE_LABELS[valueType]} on {totals.counted} of {totals.of}
                            </span>
                            <MoneyValue cents={totals.counted ? totals.totalCents : null} className="font-semibold" />
                        </li>
                    </ul>
                </>
            )}
        </div>
    );
}
