// pdf inventory record (@react-pdf/renderer). loaded on demand, only when someone exports.
// this is a record of what the user entered. it is deliberately not styled as a certificate,
// because a pdf can't authenticate an item or prove what it's worth.

import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { getCategory, isFieldVisible } from '@shared/categories.ts';
import { representativeCents } from '@shared/money.ts';
import {
    CONDITION_LABELS,
    INSURANCE_LABELS,
    OBSERVED_VALUE_TYPES,
    VALUATION_SOURCE_LABELS,
    VALUE_TYPE_LABELS,
    VALUE_TYPES,
    type ValuationRecord
} from '@shared/schemas.ts';
import { APP_NAME } from '@/config.ts';
import { formatDate, formatMoney, todayIso } from '@/lib/format.ts';
import { totalsFor, type PortfolioItem } from '@/lib/portfolio.ts';
import { downloadBlob, exportFilename } from './download.ts';

// the built-in pdf fonts only cover basic latin, so keep text to plain characters
const plain = (s: string) => s.replace(/[−–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const money = (cents: number | null | undefined) => (cents == null ? 'Not entered' : formatMoney(cents, { exact: false }));

const ink = '#14171c';
const muted = '#59616c';
const line = '#d9dde3';

const s = StyleSheet.create({
    page: { padding: 40, paddingBottom: 56, fontSize: 9, fontFamily: 'Helvetica', color: ink, lineHeight: 1.35 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: ink, paddingBottom: 8, marginBottom: 14 },
    title: { fontSize: 18, fontFamily: 'Helvetica-Bold', lineHeight: 1.2, marginBottom: 2 },
    sub: { color: muted, marginTop: 2 },
    sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryBox: { flex: 1, borderWidth: 1, borderColor: line, borderRadius: 4, padding: 8 },
    summaryLabel: { color: muted, fontSize: 8 },
    summaryValue: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
    note: { color: muted, fontSize: 8, marginTop: 6 },
    tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 3, fontFamily: 'Helvetica-Bold', fontSize: 8 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: line, paddingVertical: 4 },
    cName: { width: '26%', paddingRight: 4 },
    cCat: { width: '13%', paddingRight: 4 },
    cId: { width: '17%', paddingRight: 4 },
    cMoney: { width: '11%', textAlign: 'right', paddingRight: 4 },
    cDate: { width: '11%', textAlign: 'right' },
    item: { borderWidth: 1, borderColor: line, borderRadius: 4, padding: 10, marginBottom: 8 },
    itemTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
    kv: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
    kvCell: { width: '33.33%', marginBottom: 4, paddingRight: 6 },
    k: { color: muted, fontSize: 7.5 },
    v: { fontSize: 9 },
    footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', color: muted, fontSize: 7.5 }
});

function KV({ k, v }: { k: string; v: string | null | undefined }) {
    return (
        <View style={s.kvCell}>
            <Text style={s.k}>{k}</Text>
            <Text style={s.v}>{plain(v == null || v === '' ? 'Not entered' : v)}</Text>
        </View>
    );
}

function valueLine(v: ValuationRecord | null): string {
    if (!v) return 'Not entered';
    const amount = money(representativeCents(v));
    const range = v.lowCents != null && v.highCents != null ? ` (range ${money(v.lowCents)} to ${money(v.highCents)})` : '';
    return `${amount}${range}, ${formatDate(v.observedAt)}, ${v.sourceName ?? VALUATION_SOURCE_LABELS[v.source]}`;
}

function detailPairs(item: PortfolioItem): { k: string; v: string }[] {
    const out: { k: string; v: string }[] = [];
    for (const f of getCategory(item.asset.category).fields) {
        if (!isFieldVisible(f, item.asset.details)) continue;
        const raw = item.asset.details[f.key];
        if (raw == null || raw === '') continue;
        let v: string;
        if (typeof raw === 'boolean') v = raw ? 'Yes' : 'No';
        else if (f.type === 'select') v = f.options?.find((o) => o.value === raw)?.label ?? String(raw);
        else if (f.type === 'date' && typeof raw === 'string') v = formatDate(raw);
        else {
            // 61240 -> 61,240, but leave years alone
            const shown = typeof raw === 'number' && !/year/i.test(f.key) ? raw.toLocaleString('en-US') : String(raw);
            v = f.unit ? `${shown} ${f.unit}` : shown;
        }
        out.push({ k: f.label, v });
    }
    return out;
}

export function InventoryDoc({ items, ownerName, filtered }: { items: PortfolioItem[]; ownerName: string; filtered: boolean }) {
    const generated = formatDate(todayIso());
    const totals = VALUE_TYPES.map((t) => ({ t, ...totalsFor(items, t) }));

    return (
        <Document title={`${APP_NAME} inventory record`} author={ownerName} creator={APP_NAME}>
            <Page size="LETTER" style={s.page}>
                <View style={s.header} fixed>
                    <View>
                        <Text style={s.title}>Inventory record</Text>
                        <Text style={s.sub}>
                            {plain(ownerName)} · {items.length} item{items.length === 1 ? '' : 's'}
                            {filtered ? ' (filtered selection)' : ''}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text>{APP_NAME}</Text>
                        <Text style={s.sub}>Generated {generated}</Text>
                    </View>
                </View>

                <Text style={s.sectionTitle}>Summary</Text>
                <View style={s.summaryRow}>
                    {totals.map((t) => (
                        <View key={t.t} style={s.summaryBox}>
                            <Text style={s.summaryLabel}>{VALUE_TYPE_LABELS[t.t]}</Text>
                            <Text style={s.summaryValue}>{t.counted ? money(t.totalCents) : 'Not entered'}</Text>
                            <Text style={s.summaryLabel}>
                                on {t.counted} of {t.of} items
                            </Text>
                        </View>
                    ))}
                </View>
                <Text style={s.note}>
                    Each value type is totaled on its own and never added to the others. Values are the most recent estimates entered by the owner or a named source. They are estimates, not appraisals, and this record does not authenticate any item.
                </Text>

                <Text style={s.sectionTitle}>Items</Text>
                <View style={s.tableHead}>
                    <Text style={s.cName}>Item</Text>
                    <Text style={s.cCat}>Category</Text>
                    <Text style={s.cId}>Identifier</Text>
                    <Text style={s.cMoney}>Cost basis</Text>
                    <Text style={s.cMoney}>Fair market</Text>
                    <Text style={s.cMoney}>Replacement</Text>
                    <Text style={s.cDate}>Value as of</Text>
                </View>
                {items.map((item) => {
                    const fm = item.latest.fair_market;
                    const rp = item.latest.replacement;
                    const asOf = [fm?.observedAt, rp?.observedAt].filter(Boolean).sort().pop();
                    return (
                        <View key={item.asset.id} style={s.tableRow} wrap={false}>
                            <Text style={s.cName}>{plain(item.asset.name)}</Text>
                            <Text style={s.cCat}>{item.category.label}</Text>
                            <Text style={s.cId}>{item.identifier ? plain(item.identifier.value) : 'Not entered'}</Text>
                            <Text style={s.cMoney}>{money(item.asset.purchasePriceCents)}</Text>
                            <Text style={s.cMoney}>{money(fm ? representativeCents(fm) : null)}</Text>
                            <Text style={s.cMoney}>{money(rp ? representativeCents(rp) : null)}</Text>
                            <Text style={s.cDate}>{asOf ? formatDate(asOf) : ''}</Text>
                        </View>
                    );
                })}

                <Text style={s.sectionTitle} break>
                    Item details
                </Text>
                {items.map((item) => {
                    const a = item.asset;
                    return (
                        <View key={a.id} style={s.item} wrap={false}>
                            <Text style={s.itemTitle}>{plain(a.name)}</Text>
                            <Text style={s.sub}>
                                {item.category.singular}
                                {a.brand ? ` · ${plain(a.brand)}` : ''}
                                {a.model ? ` ${plain(a.model)}` : ''}
                                {a.isSample ? ' · TEST DATA' : ''}
                            </Text>
                            <View style={s.kv}>
                                <KV k="Condition" v={a.condition ? CONDITION_LABELS[a.condition] : null} />
                                <KV k="Location" v={a.category === 'property' ? 'n/a' : a.location} />
                                <KV k="Serial number" v={a.serialNumber} />
                                <KV k="Purchase date" v={a.purchaseDate ? formatDate(a.purchaseDate) : null} />
                                <KV k="Purchase price" v={a.purchasePriceCents != null ? money(a.purchasePriceCents) : null} />
                                <KV k="Insurance" v={a.insurance ? `${INSURANCE_LABELS[a.insurance]}${a.insuranceNote ? ` (${a.insuranceNote})` : ''}` : null} />
                                {detailPairs(item).map((d) => (
                                    <KV key={d.k} k={d.k} v={d.v} />
                                ))}
                            </View>
                            <View style={{ marginTop: 4 }}>
                                {OBSERVED_VALUE_TYPES.map((t) => (
                                    <Text key={t}>
                                        <Text style={s.k}>{VALUE_TYPE_LABELS[t]}: </Text>
                                        {plain(valueLine(item.latest[t]))}
                                    </Text>
                                ))}
                            </View>
                            {a.notes && (
                                <Text style={{ marginTop: 4 }}>
                                    <Text style={s.k}>Notes: </Text>
                                    {plain(a.notes)}
                                </Text>
                            )}
                        </View>
                    );
                })}

                <View style={s.footer} fixed>
                    <Text>
                        {APP_NAME} inventory record · generated {generated} · estimates, not appraisals
                    </Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}

export async function downloadInventoryPdf(items: PortfolioItem[], opts: { ownerName: string; filtered?: boolean; fileSuffix?: string }) {
    const blob = await pdf(<InventoryDoc items={items} ownerName={opts.ownerName} filtered={opts.filtered ?? false} />).toBlob();
    downloadBlob(blob, exportFilename('pdf', opts.fileSuffix));
}
