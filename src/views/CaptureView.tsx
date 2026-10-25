import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { ApiError } from '@/api/api.ts';
import { Button } from '@/components/ui/button.tsx';
import { usePhoneCapture } from '@/hooks/useCaptureSession.ts';
import { api } from '@/api/api.ts';

async function fileToJpeg(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read that photo.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Could not read that photo.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

export default function CaptureView() {
    const { token } = useParams();
    const capture = usePhoneCapture(token);
    const input = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [jpeg, setJpeg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const view = capture.data;
    const closed = view && view.status !== 'open';

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setNote(null);
        setSent(false);
        try {
            const data = await fileToJpeg(file);
            setJpeg(data);
            setPreview(`data:image/jpeg;base64,${data}`);
        } catch (err) {
            setNote(err instanceof Error ? err.message : 'Could not read that photo.');
        } finally {
            if (input.current) input.current.value = '';
        }
    };

    const submit = async () => {
        if (!jpeg || !token) return;
        setBusy(true);
        setNote(null);
        try {
            await api.uploadCapturePhoto(token, { groupId: crypto.randomUUID().replace(/-/g, ''), kind: 'front', mime: 'image/jpeg', data: jpeg });
            setSent(true);
            void capture.refetch();
        } catch (err) {
            setNote(err instanceof ApiError ? err.message : 'Could not send that photo.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 bg-background px-4 py-8 text-foreground">
            <div>
                <p className="text-sm text-muted-foreground">Gauge</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Upload a photo</h1>
            </div>

            {capture.isPending && <p className="text-sm text-muted-foreground">Opening…</p>}
            {capture.isError && <p className="text-sm text-destructive">{capture.error.message}</p>}
            {closed && <p className="text-sm">This link is {view.status}. Start a new one on the computer.</p>}

            {view?.status === 'open' && (
                <>
                    <button type="button" onClick={() => input.current?.click()} className="overflow-hidden rounded-lg border bg-card">
                        {preview ? (
                            <img src={preview} alt="Selected photo" className="aspect-square w-full object-cover" />
                        ) : (
                            <span className="flex aspect-square w-full items-center justify-center text-sm text-muted-foreground">Take a photo</span>
                        )}
                    </button>
                    {sent && preview && <p className="text-sm text-muted-foreground">Sent. The photo is above.</p>}
                    {note && <p className="text-sm text-destructive">{note}</p>}
                    <Button type="button" className="h-12" disabled={!jpeg || busy || sent} onClick={() => void submit()}>
                        {busy ? <LoaderCircle className="animate-spin" /> : null}
                        Submit
                    </Button>
                </>
            )}

            <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </main>
    );
}
