// Gus asking the question: Gus on the left, the question in a cream speech bubble (the SBU Hacks
// ticket stock). used by onboarding and the add-asset flow, one question per screen.
// `labelFor` makes the question the label of an input, so screen readers read it with the field.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.ts';
import { Gus, type GusPose } from './Mascots.tsx';

export function MascotQuestion({
    pose = 'calm',
    question,
    help,
    labelFor,
    className
}: {
    // calm while asking, alarm when an answer needs fixing, certify on the last step
    pose?: GusPose;
    question: ReactNode;
    help?: ReactNode;
    labelFor?: string;
    className?: string;
}) {
    const Q = labelFor ? 'label' : 'h1';
    return (
        <div className={cn('flex items-end gap-3 sm:gap-5', className)}>
            <div className="w-16 shrink-0 sm:w-28">
                <Gus pose={pose} size={112} className="mascot-bob h-auto w-full" />
            </div>
            <div className="relative mb-2 min-w-0 flex-1 rounded-xl border-[1.5px] border-[#8F4C2E] bg-ticket px-4 py-3.5 text-sbu-umber shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] sm:px-6 sm:py-5">
                {/* the bubble's tail, pointing at Gus */}
                <span aria-hidden className="absolute bottom-5 -left-[9px] size-4 rotate-45 border-b-[1.5px] border-l-[1.5px] border-[#8F4C2E] bg-ticket" />
                <Q htmlFor={labelFor} className="relative block font-display text-[28px] leading-[0.95] font-black tracking-[0.01em] text-balance uppercase sm:text-[40px]">
                    {question}
                </Q>
                {help && <p className="relative mt-2 text-sm leading-relaxed text-[#5A4127] sm:text-base">{help}</p>}
            </div>
        </div>
    );
}
