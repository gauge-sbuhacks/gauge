// fades its children up the first time they scroll into view. the motion itself is in index.css
// ([data-reveal]) so reduced-motion users get the content with no animation.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                el.dataset.shown = '';
                io.disconnect();
            },
            { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);

    return (
        <div ref={ref} data-reveal className={className} style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}>
            {children}
        </div>
    );
}
