// one asset: its four value types, value history, details, record checklist, and lookups

import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Circle, FileText, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCategory, isFieldVisible, type CategoryField } from '@shared/categories.ts';
import {
    CONDITION_LABELS,
    INSURANCE_LABELS,
    VALUATION_SOURCE_LABELS,
    VALUE_TYPE_HINTS,
    VALUE_TYPE_LABELS,
    VALUE_TYPES,
    type ValueType
} from '@shared/schemas.ts';
import { LookupPanel } from '@/components/assets/LookupPanel.tsx';
import { ValuationDialog, type ValuationFormValues } from '@/components/assets/ValuationDialog.tsx';
import { ValuationHistory } from '@/components/assets/ValuationHistory.tsx';
import { AttentionList } from '@/components/common/AttentionList.tsx';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { CompletenessRing } from '@/components/common/CompletenessRing.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { GainLoss, MoneyValue, NotEntered } from '@/components/common/ValueDisplay.tsx';
import { PageHeader } from '@/components/layout/PageHeader.tsx';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from '@/components/ui/alert-dialog.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useAssetItem, useDeleteAsset } from '@/hooks/usePortfolio.ts';
import { formatAge, formatDate, formatNumber } from '@/lib/format.ts';
import { attentionFor, itemGain, latestOf, valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
import NotFoundView from './NotFoundView.tsx';

function DetailRow({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
    return (
        <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={mono ? 'font-mono break-all' : 'break-words'}>{children}</dd>
        </div>
    );
}

function fieldValue(f: CategoryField, raw: unknown): ReactNode {
    if (raw == null || raw === '') return <NotEntered />;
    if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
    if (f.type === 'select') return f.options?.find((o) => o.value === raw)?.label ?? String(raw);
    if (f.type === 'date' && typeof raw === 'string') return formatDate(raw);
    // years read wrong with a thousands separator ("2,020")
    if (typeof raw === 'number') return /year/i.test(f.key) ? String(raw) : formatNumber(raw, f.unit);
    return String(raw);
}

function ValueCard({ item, type, onAdd }: { item: PortfolioItem; type: ValueType; onAdd: () => void }) {
    const cents = valueOf(item, type);
    const latest = latestOf(item, type);
    return (
        <div className="flex flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10" title={VALUE_TYPE_HINTS[type]}>
            <span className="text-sm text-muted-foreground">{VALUE_TYPE_LABELS[type]}</span>
            <span className="mt-1 text-xl font-semibold tracking-tight">
                <MoneyValue cents={cents} />
            </span>
            <span className="mt-auto pt-1 text-xs text-muted-foreground">
                {type === 'cost_basis' ? (
                    item.asset.purchaseDate ? (
                        `Paid ${formatDate(item.asset.purchaseDate)}`
                    ) : cents != null ? (
                        'Purchase date not entered'
                    ) : (
                        <Link to={`/assets/${item.asset.id}/edit`} className="font-medium text-foreground hover:underline">
                            Add purchase info
                        </Link>
                    )
                ) : latest ? (
                    <>
                        {formatAge(latest.observedAt)} · {latest.sourceName ?? VALUATION_SOURCE_LABELS[latest.source]}
                        {latest.lowCents != null && latest.highCents != null && latest.amountCents == null && ' · midpoint'}
                    </>
                ) : (
                    <button type="button" onClick={onAdd} className="font-medium text-foreground hover:underline">
                        Record one
                    </button>
                )}
            </span>
        </div>
    );
}

export default function AssetDetailView() {
    const { id } = useParams();
    const { item, isLoading, error, refetch } = useAssetItem(id);

    if (isLoading) return <LoadingBlock />;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()} />;
    if (!item) return <NotFoundView what="asset" />;
    return <AssetDetail item={item} />;
}

function AssetDetail({ item }: { item: PortfolioItem }) {
    const navigate = useNavigate();
    const auth = useAuthInfo();
    const del = useDeleteAsset();
    const [dialogOpen, setDialogOpen] = useState(false);
    // kept in state (not rebuilt each render) so the dialog's reset effect only fires on open
    const [dialogInitial, setDialogInitial] = useState<Partial<ValuationFormValues> | undefined>(undefined);
    const [exporting, setExporting] = useState(false);

    const { asset, category } = item;
    const def = getCategory(asset.category);
    const gain = itemGain(item);
    const attention = useMemo(() => attentionFor([item]), [item]);

    const openRecord = (initial?: Partial<ValuationFormValues>) => {
        setDialogInitial(initial);
        setDialogOpen(true);
    };

    const remove = () =>
        del.mutate(asset.id, {
            onSuccess: () => {
                toast.success(`${asset.name} deleted`);
                navigate('/assets');
            },
            onError: (err) => toast.error("Couldn't delete it", { description: err.message })
        });

    const exportPdf = async () => {
        setExporting(true);
        try {
            const { downloadInventoryPdf } = await import('@/lib/export/pdf.tsx');
            const slug = asset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
            await downloadInventoryPdf([item], { ownerName: auth.displayName, fileSuffix: slug });
        } catch (err) {
            toast.error("Couldn't build the PDF", { description: err instanceof Error ? err.message : undefined });
        } finally {
            setExporting(false);
        }
    };

    const subtitle = [category.singular, [asset.brand, asset.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const fmvLatest = item.latest.fair_market;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow={
                    <Link to="/assets" className="inline-flex items-center gap-1 hover:text-foreground">
                        <ArrowLeft className="size-3.5" />
                        Assets
                    </Link>
                }
                title={
                    <span className="flex items-center gap-3">
                        <CategoryBadgeIcon id={asset.category} className="size-10" />
                        <span className="min-w-0">
                            <span className="block truncate">{asset.name}</span>
                            <span className="block text-sm font-normal text-muted-foreground">{subtitle}</span>
                        </span>
                    </span>
                }
                actions={
                    <>
                        <Button variant="outline" onClick={() => openRecord()}>
                            <Plus data-icon="inline-start" />
                            Record a value
                        </Button>
                        <Button variant="outline" onClick={exportPdf} disabled={exporting}>
                            {exporting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                            PDF
                        </Button>
                        <Button asChild>
                            <Link to={`/assets/${asset.id}/edit`}>
                                <Pencil data-icon="inline-start" />
                                Edit
                            </Link>
                        </Button>
                    </>
                }
            />

            <div className="flex flex-wrap items-center gap-2">
                {asset.isSample && (
                    <Badge variant="outline" className="border-brass/40 bg-brass-soft text-brass">
                        Test data
                    </Badge>
                )}
                {asset.condition && <Badge variant="secondary">{CONDITION_LABELS[asset.condition]} condition</Badge>}
                {asset.location && asset.category !== 'property' && <Badge variant="secondary">{asset.location}</Badge>}
                <Badge variant="secondary">{asset.insurance ? INSURANCE_LABELS[asset.insurance] : 'Insurance not entered'}</Badge>
                {gain && (
                    <span className="ml-1 inline-flex items-center gap-1 text-sm">
                        <GainLoss cents={gain.gainCents} ratio={gain.ratio} />
                        <span className="text-muted-foreground">fair market vs. cost basis</span>
                    </span>
                )}
            </div>

            {/* the four value types, side by side, never summed */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {VALUE_TYPES.map((t) => (
                    <ValueCard key={t} item={item} type={t} onAdd={() => openRecord({ valueType: t === 'cost_basis' ? 'fair_market' : t })} />
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Value history</CardTitle>
                            <CardDescription>
                                {item.valuations.length === 0
                                    ? 'Nothing recorded yet.'
                                    : `${item.valuations.length} recorded value${item.valuations.length === 1 ? '' : 's'}${fmvLatest ? `, latest fair market ${formatAge(fmvLatest.observedAt)}` : ''}. Past values are only what was recorded; nothing is projected.`}
                            </CardDescription>
                            <CardAction>
                                <Button size="sm" variant="ghost" onClick={() => openRecord()}>
                                    <Plus data-icon="inline-start" />
                                    Record
                                </Button>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            <ValuationHistory item={item} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="divide-y divide-border">
                                {def.brandLabel && <DetailRow label={def.brandLabel}>{asset.brand ?? <NotEntered />}</DetailRow>}
                                {def.modelLabel && <DetailRow label={def.modelLabel}>{asset.model ?? <NotEntered />}</DetailRow>}
                                {def.fields
                                    .filter((f) => isFieldVisible(f, asset.details))
                                    .map((f) => (
                                        <DetailRow key={f.key} label={f.label} mono={f.mono && asset.details[f.key] != null}>
                                            {fieldValue(f, asset.details[f.key])}
                                        </DetailRow>
                                    ))}
                                <DetailRow label="Serial number" mono={asset.serialNumber != null}>
                                    {asset.serialNumber ?? <NotEntered />}
                                </DetailRow>
                                <DetailRow label="Condition">{asset.condition ? CONDITION_LABELS[asset.condition] : <NotEntered />}</DetailRow>
                                {asset.category !== 'property' && <DetailRow label="Location">{asset.location ?? <NotEntered />}</DetailRow>}
                                <DetailRow label="Purchase date">{asset.purchaseDate ? formatDate(asset.purchaseDate) : <NotEntered />}</DetailRow>
                                <DetailRow label="Purchase price">
                                    <MoneyValue cents={asset.purchasePriceCents} />
                                </DetailRow>
                                <DetailRow label="Insurance">
                                    {asset.insurance ? INSURANCE_LABELS[asset.insurance] : <NotEntered />}
                                    {asset.insuranceNote && <span className="text-muted-foreground"> ({asset.insuranceNote})</span>}
                                </DetailRow>
                                {asset.notes && <DetailRow label="Notes">{asset.notes}</DetailRow>}
                                <DetailRow label="Added">{formatDate(asset.createdAt.slice(0, 10))}</DetailRow>
                                <DetailRow label="Last updated">{formatAge(asset.updatedAt.slice(0, 10))}</DetailRow>
                            </dl>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CompletenessRing done={item.done} total={item.total} size={24} showLabel={false} />
                                Record {item.done} of {item.total}
                            </CardTitle>
                            <CardDescription>{item.documented ? 'Documented well enough for a claim.' : 'Missing proof for an insurance claim.'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2.5 text-sm">
                                {item.checks.map((c) => (
                                    <li key={c.id} className="flex items-start gap-2">
                                        {c.done ? (
                                            <span className="mt-0.5 flex size-4 items-center justify-center rounded-full bg-good text-white">
                                                <Check className="size-3" />
                                            </span>
                                        ) : (
                                            <Circle className="mt-0.5 size-4 text-muted-foreground/60" />
                                        )}
                                        <div>
                                            <div className={c.done ? '' : 'text-muted-foreground'}>{c.label}</div>
                                            {!c.done &&
                                                (c.id === 'estimate' ? (
                                                    <button type="button" onClick={() => openRecord()} className="text-xs font-medium hover:underline">
                                                        {c.hint}
                                                    </button>
                                                ) : (
                                                    <Link to={`/assets/${asset.id}/edit`} className="text-xs font-medium hover:underline">
                                                        {c.hint}
                                                    </Link>
                                                ))}
                                        </div>
                                    </li>
                                ))}
                                <li className="flex items-start gap-2 text-muted-foreground">
                                    <Circle className="mt-0.5 size-4 opacity-40" />
                                    <div>
                                        Photos
                                        <div className="text-xs">Coming in the photo phase</div>
                                    </div>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>

                    {attention.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Needs attention</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <AttentionList items={attention} showAsset={false} />
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Lookups</CardTitle>
                            <CardDescription>Suggestions only. You review before anything changes.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <LookupPanel item={item} onRecord={(initial) => openRecord(initial)} />
                        </CardContent>
                    </Card>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full">
                                <Trash2 data-icon="inline-start" />
                                Delete asset
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This removes the asset and its {item.valuations.length} recorded value{item.valuations.length === 1 ? '' : 's'}. It can't be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep it</AlertDialogCancel>
                                <AlertDialogAction variant="destructive" onClick={remove} disabled={del.isPending}>
                                    Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            <ValuationDialog assetId={asset.id} open={dialogOpen} onOpenChange={setDialogOpen} initial={dialogInitial} />
        </div>
    );
}
