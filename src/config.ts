// app-wide settings. the name lives only here, so changing it later is a one-line edit.

export const APP_NAME = 'Gauge';
export const APP_TAGLINE = 'A net-worth tracker for the things you can touch';
export const COPYRIGHT = `© 2026 ${APP_NAME}. All Rights Reserved.`;

// the legal pages, linked from every footer
export const LEGAL_LINKS = [
    { to: '/privacy', label: 'Privacy Policy' },
    { to: '/terms', label: 'Terms of Service' },
    { to: '/accessibility', label: 'Accessibility Statement' }
] as const;

// set this in .env.local to turn on clerk sign-in. without it the app runs as the local dev user
// (the ?. keeps this file loadable outside vite, like a node script that renders the pdf)
export const CLERK_PUBLISHABLE_KEY = (import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() || null;
