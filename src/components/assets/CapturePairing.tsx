import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toDataURL } from 'qrcode';
import { LoaderCircle, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import type { CaptureMode } from '@shared/capture.ts';
import { Button } from '@/components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.tsx';
import { AuthImage } from '@/components/assets/AuthImage.tsx';
import { useCaptureDesk } from '@/hooks/useCaptureSession.ts';
import { formatMoney } from '@/lib/format.ts';

export function CapturePairing({ assetId, label }: { assetId?: string; label?: string }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<CaptureMode>(assetId ? 'catalog' : 'once');
    const [qr, setQr] = useState<string | null>(null);
    const desk = useCaptureDesk(assetId, open);
    const view = desk.session.data;
    const token = desk.token;
    const link = token ? `${window.location.origin}/capture/${token}` : null;
    const local = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname);

    useEffect(() => {
        if (!link) {
            setQr(null);
            return;
        }
        let cancel = false;
        void toDataURL(link, { margin: 1, width: 220 }).then((url) => {
            if (!cancel) setQr(url);
        });
        return () => {
            cancel = true;
        };
    }, [link]);

    const start = (next: CaptureMode) => {
        setMode(next);
        desk.create.mutate(next, { onError: (err) => toast.error(err.message) });
    };

    return (
        <>
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>
                <Smartphone data-icon="inline-start" />
                {label ?? (assetId ? 'Add photos' : 'Add with phone')}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{assetId ? 'Add photos from your phone' : 'Add with phone'}</DialogTitle>
                        <DialogDescription>Scan the code. The phone does not need the app or a login. Photos show up here while you are still holding it.</DialogDescription>
                    </DialogHeader>

                    {!view && (
                        <div className="flex flex-wrap gap-2">
                            {!assetId && (
                                <Button type="button" variant={mode === 'once' ? 'default' : 'outline'} onClick={() => start('once')} disabled={desk.create.isPending}>
                                    One item, 10 min
                                </Button>
                            )}
                            <Button type="button" variant={mode === 'catalog' ? 'default' : 'outline'} onClick={() => start('catalog')} disabled={desk.create.isPending}>
                                Keep adding, 45 min
                            </Button>
                        </div>
                    )}

                    {desk.create.isPending && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircle className="size-4 animate-spin" /> Starting a capture link
                        </p>
                    )}

                    {link && (
                        <div className="flex flex-col items-start gap-3 sm:flex-row">
                            {qr && <img src={qr} alt="QR code for this capture link" width={220} height={220} className="rounded-lg border bg-white p-2" />}
                            <div className="min-w-0 space-y-2 text-sm">
                                <p className="break-all text-muted-foreground">{link}</p>
                                {local && <p>This address is on this computer. A phone can open it only if you use the network address (`npm run dev -- --host`) or the deployed site.</p>}
                                <p>{view?.status === 'open' ? `Open until ${new Date(view.expiresAt).toLocaleTimeString()}.` : view ? `This link is ${view.status}.` : 'Waiting for the session.'}</p>
                                <Button type="button" variant="outline" size="sm" onClick={() => desk.revoke.mutate()} disabled={desk.revoke.isPending || view?.status !== 'open'}>
                                    Revoke link
                                </Button>
                            </div>
                        </div>
                    )}

                    {view && view.drafts.filter((d) => d.status !== 'discarded').length > 0 && (
                        <ul className="max-h-72 space-y-3 overflow-y-auto">
                            {view.drafts
                                .filter((d) => d.status !== 'discarded')
                                .map((draft) => (
                                    <li key={draft.id} className="flex gap-3 rounded-lg border p-3">
                                        {draft.photos[0] && <AuthImage photoId={draft.photos[0].photoId} alt="" className="size-16 rounded-md object-cover" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium">{draft.name || (draft.status === 'identifying' ? 'Identifying…' : 'Untitled item')}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {[draft.category, draft.lookupMessage].filter(Boolean).join(' · ') || draft.status}
                                            </p>
                                            {draft.suggestedValue && <p className="text-xs">{formatMoney(draft.suggestedValue.amountCents)} suggested</p>}
                                            {draft.status === 'ready' && (
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={desk.confirm.isPending}
                                                        onClick={() =>
                                                            desk.confirm.mutate(draft.id, {
                                                                onSuccess: (data) => {
                                                                    toast.success(assetId ? 'Photos added' : 'Asset saved');
                                                                    if (!assetId) navigate(`/assets/${data.assetId}`);
                                                                },
                                                                onError: (err) => toast.error(err.message)
                                                            })
                                                        }
                                                    >
                                                        {assetId ? 'Add photos' : 'Confirm'}
                                                    </Button>
                                                    {!assetId && (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={desk.confirm.isPending}
                                                            onClick={() =>
                                                                desk.confirm.mutate(draft.id, {
                                                                    onSuccess: (data) => navigate(`/assets/${data.assetId}/edit`),
                                                                    onError: (err) => toast.error(err.message)
                                                                })
                                                            }
                                                        >
                                                            Edit
                                                        </Button>
                                                    )}
                                                    <Button type="button" size="sm" variant="outline" onClick={() => desk.discard.mutate(draft.id)}>
                                                        Discard
                                                    </Button>
                                                </div>
                                            )}
                                            {draft.status === 'confirmed' && draft.assetId && <p className="mt-1 text-xs text-muted-foreground">Saved</p>}
                                        </div>
                                    </li>
                                ))}
                        </ul>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
