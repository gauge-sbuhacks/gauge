/**
  * Reusable class strings for the industrial look. Spread onto shadcn <Button> via className,
  * or onto plain elements. Every color comes from the tokens in src/css/index.css.
  */

/** Primary action: polished brass plate, umber ink, Big Shoulders caps. One per screen area. */
export const brassButton =
    'inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md border border-[#5A3A06] ' +
    'bg-[linear-gradient(180deg,#FAD06A,#F4A906_52%,#C68A06)] text-sbu-umber ' +
    'font-display text-lg font-extrabold uppercase tracking-[0.05em] ' +
    'shadow-[inset_0_1px_0_rgba(255,250,220,0.75),0_2px_0_rgba(0,0,0,0.35)] ' +
    'hover:brightness-105 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Secondary action: copper outline. */
export const copperButton =
    'inline-flex items-center justify-center gap-2 h-[42px] px-4 rounded-sm border-[1.5px] border-copper bg-transparent text-foreground ' +
    'font-display text-[17px] font-extrabold uppercase tracking-[0.05em] hover:bg-copper/10 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** 'Test data' marker, styled as an SBU Hacks ticket stub so test data is always obvious. */
export const ticketStub =
    'inline-flex items-center gap-2 h-[42px] px-3.5 rounded-sm border-[1.5px] border-dashed border-[#8F4C2E] bg-ticket ' +
    'text-[13.5px] font-bold text-[#6E1E08]';

/** Segmented control track (value-type tabs, 1Y/3Y/5Y/All). */
export const tabTrack = 'inline-flex flex-wrap gap-[3px] p-1 rounded-[9px] border border-border bg-inset shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]';

/** Selected tab: brass plate. Pair with aria-pressed="true" or aria-selected. */
export const tabActive =
    'h-9 px-4 rounded-[6px] border border-[#5A3A06] bg-[linear-gradient(180deg,#FAD06A,#F4A906_52%,#C68A06)] text-sbu-umber ' +
    'font-display text-[17px] font-extrabold uppercase tracking-[0.05em] shadow-[inset_0_1px_0_rgba(255,250,220,0.75)]';

/** Unselected tab. */
export const tabIdle = 'h-9 px-4 rounded-[6px] border-0 bg-transparent text-muted-foreground font-display text-[17px] font-bold uppercase tracking-[0.05em] hover:text-foreground';

/** Big money figures: Barlow 800, tabular so number rolls don't jitter. */
export const totalFigure = 'font-extrabold tabular-nums [font-stretch:78%] tracking-[-0.01em]';

/** Page title. */
export const pageTitle = 'font-display text-[52px] leading-[0.95] font-black uppercase tracking-[0.01em]';

/** Copper bar fill and the brass fill for the value type that is showing. */
export const copperFill = 'bg-[linear-gradient(180deg,#F2C08A,#C47A2C_45%,#7E4612)]';
export const brassFill = 'bg-[linear-gradient(180deg,#FCE3A8,#F4A906_45%,#C68A06)]';

/** Inset track for bars ('pipes'). */
export const barTrack = 'overflow-hidden rounded-full border border-border bg-inset shadow-[inset_0_2px_3px_rgba(0,0,0,0.35)]';
