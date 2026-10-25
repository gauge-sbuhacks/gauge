// styles clerk's prebuilt sign-in and sign-up to match the app. the colors point at the theme's css
// variables (css/index.css), so the form follows light and dark like everything else.
// cssLayerName puts clerk's styles in the "clerk" layer, which index.css orders below tailwind
// utilities, so the class names in `elements` win over clerk's defaults.

export const clerkAppearance = {
    cssLayerName: 'clerk',
    variables: {
        colorPrimary: 'var(--primary)',
        colorPrimaryForeground: 'var(--primary-foreground)',
        colorForeground: 'var(--foreground)',
        colorMutedForeground: 'var(--muted-foreground)',
        colorMuted: 'var(--muted)',
        colorBackground: 'var(--card)',
        colorInput: 'var(--inset)',
        colorInputForeground: 'var(--foreground)',
        // borders (and hover fills) are derived from this at low opacity, so it has to be dark.
        // setting colorBorder to the app's light border gray made input outlines disappear
        colorNeutral: 'var(--foreground)',
        colorDanger: 'var(--destructive)',
        colorRing: 'var(--ring)',
        borderRadius: '0.5rem',
        fontFamily: "'Barlow', system-ui, sans-serif",
        fontFamilyButtons: "'Big Shoulders', 'Barlow', sans-serif"
    },
    options: {
        // full-width "Continue with Google" rows instead of a strip of bare icons
        socialButtonsVariant: 'blockButton' as const,
        socialButtonsPlacement: 'top' as const,
        // the page already shows the gauge logo next to the form
        logoPlacement: 'none' as const
    },
    elements: {
        rootBox: 'w-full',
        cardBox: 'w-full shadow-[var(--hairline-top),var(--shadow-card)] border border-border',
        card: 'shadow-none',
        headerTitle: 'font-display text-2xl font-black uppercase tracking-[0.02em]',
        socialButtonsBlockButton: 'h-10',
        formButtonPrimary:
            'h-10 border border-[#5A3A06] bg-[linear-gradient(180deg,#FAD06A,#F4A906_52%,#C68A06)] font-display text-base font-extrabold uppercase tracking-[0.05em] text-sbu-umber shadow-[inset_0_1px_0_rgba(255,250,220,0.75)] hover:brightness-105'
    }
};
