// styles clerk's prebuilt sign-in and sign-up to match the app. clerk can't read css variables in
// older browsers, so the colors are repeated here from css/index.css; keep the two in step.
// cssLayerName puts clerk's styles in the "clerk" layer, which index.css orders below tailwind
// utilities, so the class names in `elements` win over clerk's defaults.

export const clerkAppearance = {
    cssLayerName: 'clerk',
    variables: {
        colorPrimary: '#1f2933',
        colorPrimaryForeground: '#f8fafc',
        colorForeground: '#14171c',
        colorMutedForeground: '#59616c',
        colorMuted: '#eceef1',
        colorBackground: '#ffffff',
        colorInput: '#ffffff',
        colorInputForeground: '#14171c',
        // borders (and hover fills) are derived from this at low opacity, so it has to be dark.
        // setting colorBorder to the app's light border gray made input outlines disappear
        colorNeutral: '#14171c',
        colorDanger: '#c2362f',
        colorRing: '#8a94a3',
        borderRadius: '0.5rem',
        fontFamily: "'Geist Variable', system-ui, sans-serif",
        fontFamilyButtons: "'Geist Variable', system-ui, sans-serif"
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
        cardBox: 'w-full shadow-none ring-1 ring-foreground/10',
        card: 'shadow-none',
        headerTitle: 'text-lg font-semibold tracking-tight',
        socialButtonsBlockButton: 'h-10',
        formButtonPrimary: 'h-10 text-sm font-medium shadow-none'
    }
};
