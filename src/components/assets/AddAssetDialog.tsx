import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { toDataURL } from 'qrcode';
import { Camera, LoaderCircle, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.tsx';
import { useCaptureDesk } from '@/hooks/useCaptureSession.ts';

export function AddAssetDialog({ children }: { children: ReactElement }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'choice' | 'photo'>('choice');
    const [qr, setQr] = useState<string | null>(null);
    const desk = useCaptureDesk(undefined, open && step === 'photo');
    const started = useRef(false);
    const reviewing = useRef(false);
    const token = desk.token;
    const link = token ? `${window.location.origin}/capture/${token}` : null;
    const local = typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname);

    useEffect(() => {
        if (step !== 'photo' || started.current) return;
        started.current = true;
        desk.create.mutate('once', { onError: (err) => toast.error(err.message) });
    }, [step, desk.create]);

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

    useEffect(() => {
        const ready = desk.session.data?.drafts.some((draft) => draft.status === 'ready');
        if (!ready || !desk.sessionId || reviewing.current) return;
        reviewing.current = true;
        setOpen(false);
        navigate(`/assets/review/${desk.sessionId}`);
    }, [desk.session.data, desk.sessionId, navigate]);

    const close = (next: boolean) => {
        if (!next && !reviewing.current && desk.sessionId && desk.session.data?.status === 'open') desk.revoke.mutate();
        if (!next) {
            setStep('choice');
            started.current = false;
        }
        setOpen(next);
    };

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                {step === 'choice' ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Add an asset</DialogTitle>
                            <DialogDescription>Choose how you want to add it.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    navigate('/assets/new');
                                }}
                                className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                            >
                                <PenLine className="size-4 text-muted-foreground" />
                                <span className="font-medium">Enter manually</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep('photo')}
                                className="flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                            >
                                <Camera className="size-4 text-muted-foreground" />
                                <span className="font-medium">Enter through photo upload</span>
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Upload a photo</DialogTitle>
                            <DialogDescription>Process will proceed once image is uploaded.</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col items-center gap-3">
                            {desk.create.isPending && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
                            {qr && <img src={qr} alt="QR code" width={220} height={220} className="rounded-lg border bg-white p-2" />}
                            {local && <p className="text-center text-sm text-muted-foreground">Use the deployed site, or run the app on your network address, so the phone can open this code.</p>}
                            <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>
                                Cancel
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
