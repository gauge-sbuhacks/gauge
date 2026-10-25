import type { ElementType, ReactNode } from 'react';
import { cx } from './status.ts';

type RivetLayout = 'corners' | 'top' | 'diagonal' | 'none';

const POSITIONS: Record<Exclude<RivetLayout, 'none'>, string[]> = {
    corners: ['left-2.5 top-2.5', 'right-2.5 top-2.5', 'left-2.5 bottom-2.5', 'right-2.5 bottom-2.5'],
    top: ['left-2.5 top-2.5', 'right-2.5 top-2.5'],
    diagonal: ['right-2 top-2', 'left-2 bottom-2'],
};

export function Rivet({ className }: { className?: string }) {
    return <span aria-hidden className={cx('pointer-events-none absolute size-[7px] rounded-full', className)} style={{ background: 'var(--rivet)' }} />;
}

/**
  * The riveted plate every dashboard card sits on: warm gradient, hairline top highlight,
  * soft drop shadow and small copper rivets. Rivets only go on card corners and seams.
  */
export function RivetCard({
    as: Tag = 'section',
    rivets = 'top',
    raised = false,
    className,
    children,
}: {
    as?: ElementType;
    rivets?: RivetLayout;
    /** Adds the deeper shadow (hero and Pressure cards). */
    raised?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Tag
            className={cx('relative rounded-lg border border-border bg-gradient-to-b from-card-top to-card', className)}
            style={{ boxShadow: raised ? 'var(--hairline-top), var(--shadow-card)' : 'var(--hairline-top)' }}
        >
            {rivets !== 'none' && POSITIONS[rivets].map((pos) => <Rivet key={pos} className={pos} />)}
            {children}
        </Tag>
    );
}

/** Engraved section label: Barlow 700, caps, tracked, in copper. */
export function EngravedLabel({ children, className }: { children: ReactNode; className?: string }) {
    return <span className={cx('text-[11px] font-bold uppercase tracking-[0.14em] text-label [font-stretch:125%]', className)}>{children}</span>;
}

/** Card heading in Big Shoulders caps. */
export function PlateHeading({ children, className }: { children: ReactNode; className?: string }) {
    return <h2 className={cx('m-0 font-display text-2xl font-extrabold uppercase tracking-[0.02em]', className)}>{children}</h2>;
}
