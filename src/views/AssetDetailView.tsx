import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowUpRight, FileText, LoaderCircle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCategory, isFieldVisible, type CategoryField } from '@shared/categories.ts';
import { CONDITION_LABELS, VALUATION_SOURCE_LABELS, VALUE_TYPE_HINTS, VALUE_TYPE_LABELS, VALUE_TYPES, type ValueType } from '@shared/schemas.ts';
import { AssetHistory } from '@/components/assets/AssetHistory.tsx';
import { DepreciationCard } from '@/components/assets/DepreciationCard.tsx';
import { LookupPanel } from '@/components/assets/LookupPanel.tsx';
import { SellingPanel } from '@/components/assets/SellingPanel.tsx';
import { ValuationDialog, type ValuationFormValues } from '@/components/assets/ValuationDialog.tsx';
import { CategoryBadgeIcon } from '@/components/common/CategoryIcon.tsx';
import { ErrorPanel, LoadingBlock } from '@/components/common/QueryStates.tsx';
import { MoneyValue, NotEntered } from '@/components/common/ValueDisplay.tsx';
import { PageHeader } from '@/components/layout/PageHeader.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { useAuthInfo } from '@/context/AuthContext.tsx';
import { useAssetItem, useDeleteAsset } from '@/hooks/usePortfolio.ts';
import { formatAge, formatDate, formatNumber } from '@/lib/format.ts';
import { latestOf, valueOf, type PortfolioItem } from '@/lib/portfolio.ts';
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
        <div className="flex min-w-0 flex-col rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4" title={VALUE_TYPE_HINTS[type]}>
            <span className="text-xs text-muted-foreground sm:text-sm">{VALUE_TYPE_LABELS[type]}</span>
            <span className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
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
    if (isLoading) return <LoadingBlock/>;
    if (error) return <ErrorPanel error={error} onRetry={() => refetch()}/>;
    if (!item) return <NotFoundView what="asset"/>;
    return <AssetDetail key={item.asset.id} item={item}/>;
}

function AssetDetail({ item }: { item: PortfolioItem }) {
    const navigate = useNavigate();
    const auth = useAuthInfo();
    const del = useDeleteAsset();
    const [dialogOpen,setDialogOpen] = useState(false);
    const [dialogInitial,setDialogInitial] = useState<Partial<ValuationFormValues> | undefined>();
    const [exporting,setExporting] = useState(false);
    const { asset,category } = item;
    const def = getCategory(asset.category);
    const openRecord = (initial?: Partial<ValuationFormValues>) => {setDialogInitial(initial);setDialogOpen(true);};
    const remove = () => del.mutate(asset.id,{onSuccess:() => {toast.success(`${asset.name} deleted`);navigate('/assets');},onError:err => toast.error(err.message)});
    const exportPdf = async () => {
        setExporting(true);
        try {
            const {downloadInventoryPdf} = await import('@/lib/export/pdf.tsx');
            const slug=asset.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)||'asset';
            await downloadInventoryPdf([item],{ownerName:auth.displayName,fileSuffix:slug});
        } catch(err) {toast.error("Couldn't build the PDF",{description:err instanceof Error?err.message:undefined});}
        finally {setExporting(false);}
    };
    const supportsLookup = ['vehicle','property','jewelry'].includes(asset.category) || (asset.category==='collectible'&&asset.details.kind==='trading_card');
    return <div className="space-y-6">
        <PageHeader eyebrow={<Link to="/assets" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5"/>Assets</Link>}
            title={<span className="flex min-w-0 items-center gap-3"><CategoryBadgeIcon id={asset.category} className="size-10 shrink-0"/><span className="min-w-0"><span className="block break-words">{asset.name}</span><span className="block text-sm font-normal text-muted-foreground">{category.singular}{asset.condition?` · ${CONDITION_LABELS[asset.condition]}`:''}</span></span></span>}
            actions={<><Button asChild variant="outline"><Link to={`/assets/${asset.id}/edit`}><Pencil/>Edit</Link></Button><Button asChild><a href="#sell">Sell this item<ArrowUpRight/></a></Button></>}/>
        {asset.isSample && <Badge variant="outline">Test data</Badge>}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">{VALUE_TYPES.map(type => <ValueCard key={type} item={item} type={type} onAdd={() => openRecord({valueType:type==='cost_basis'?'fair_market':type})}/>)}</div>
        <AssetHistory item={item} onRecord={() => openRecord()}/>
        <SellingPanel item={item}/>
        {supportsLookup && <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Find a current value</summary><div className="mt-5 max-w-2xl"><LookupPanel item={item} onRecord={openRecord}/></div></details>}
        {asset.category==='vehicle' && <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Vehicle projection</summary><div className="mt-5"><DepreciationCard item={item}/></div></details>}
        <details className="rounded-xl border bg-card p-5">
            <summary className="cursor-pointer text-sm font-semibold">Item details & documents</summary>
            <dl className="mt-4 divide-y divide-border">
                {asset.brand && <DetailRow label={def.brandLabel??'Brand'}>{asset.brand}</DetailRow>}
                {asset.model && <DetailRow label={def.modelLabel??'Model'}>{asset.model}</DetailRow>}
                {def.fields.filter(f => isFieldVisible(f,asset.details)&&asset.details[f.key]!=null&&asset.details[f.key]!=='').map(f => <DetailRow key={f.key} label={f.label} mono={f.mono}>{fieldValue(f,asset.details[f.key])}</DetailRow>)}
                {asset.serialNumber && <DetailRow label="Serial number" mono>{asset.serialNumber}</DetailRow>}
                {asset.location && <DetailRow label="Location">{asset.location}</DetailRow>}
                {asset.purchaseDate && <DetailRow label="Purchase date">{formatDate(asset.purchaseDate)}</DetailRow>}
                {asset.notes && <DetailRow label="Notes">{asset.notes}</DetailRow>}
                <DetailRow label="Added">{formatDate(asset.createdAt.slice(0,10))}</DetailRow>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportPdf} disabled={exporting}>{exporting?<LoaderCircle className="animate-spin"/>:<FileText/>}Download PDF</Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive"><Trash2/>Delete asset</Button></AlertDialogTrigger>
                    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {asset.name}?</AlertDialogTitle><AlertDialogDescription>This removes the asset, its recorded values, and saved research history. It can't be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={remove} disabled={del.isPending}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                </AlertDialog>
            </div>
        </details>
        <ValuationDialog assetId={asset.id} open={dialogOpen} onOpenChange={setDialogOpen} initial={dialogInitial}/>
    </div>;
}
