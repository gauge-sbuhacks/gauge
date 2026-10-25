// a mascot asking the question: the character on the left, the question in a cream speech bubble
// (the SBU Hacks ticket stock). used by onboarding and the add-asset flow, one question per screen.
// `labelFor` makes the question the label of an input, so screen readers read it with the field.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';
import { Boyle, Gus, Puff, type BoylePose, type GusPose, type PuffPose } from './Mascots.tsx';

export type Speaker = { who: 'gus'; pose: GusPose } | { who: 'boyle'; pose: BoylePose } | { who: 'puff'; pose: PuffPose };

export function MascotFigure({ speaker, className }: { speaker: Speaker; className?: string }) {
    const cls = cn('mascot-bob h-auto w-full', className);
    if (speaker.who === 'gus') return <Gus pose={speaker.pose} size={112} className={cls} />;
    if (speaker.who === 'boyle') return <Boyle pose={speaker.pose} size={112} className={cls} />;
    // puff is decorative (alt=""), so give the bubble's question its name
    return <Puff pose={speaker.pose} size={112} className={cls} />;
}

export function MascotQuestion({
    speaker,
    question,
    help,
    labelFor,
    className
}: {
    speaker: Speaker;
    question: ReactNode;
    help?: ReactNode;
    labelFor?: string;
    className?: string;
}) {
    const Q = labelFor ? 'label' : 'h1';
    return (
        <div className={cn('flex items-end gap-3 sm:gap-5', className)}>
            <div className="w-16 shrink-0 sm:w-28">
                <MascotFigure speaker={speaker} />
            </div>
            <div className="relative mb-2 min-w-0 flex-1 rounded-xl border-[1.5px] border-[#8F4C2E] bg-ticket px-4 py-3.5 text-sbu-umber shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] sm:px-6 sm:py-5">
                {/* the bubble's tail, pointing at the speaker */}
                <span aria-hidden className="absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-[1.5px] border-l-[1.5px] border-[#8F4C2E] bg-ticket" />
                <Q htmlFor={labelFor} className="relative block font-display text-[28px] leading-[0.95] font-black tracking-[0.01em] text-balance uppercase sm:text-[40px]">
                    {question}
                </Q>
                {help && <p className="relative mt-2 text-sm leading-relaxed text-[#5A4127] sm:text-base">{help}</p>}
            </div>
        </div>
    );
}
