import { useEffect, useState } from 'react';
import { api } from '@/api/api.ts';

export function AuthImage({ photoId, alt, className }: { photoId: string; alt: string; className?: string }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let url: string | null = null;
        void api.photoBlob(photoId).then((blob) => {
            if (cancelled) return;
            url = URL.createObjectURL(blob);
            setSrc(url);
        }).catch(() => {
            if (!cancelled) setSrc(null);
        });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [photoId]);

    if (!src) return <div className={className} aria-hidden />;
    return <img src={src} alt={alt} className={className} />;
}
