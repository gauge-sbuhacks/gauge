// light ("Ticket") or dark ("Boiler room"). dark is the default; the choice is remembered in this
// browser. index.html applies a saved choice before the first paint so the page never flashes.

import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'gauge-theme';

function current(): Theme {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(current);
    const setTheme = useCallback((next: Theme) => {
        document.documentElement.classList.toggle('dark', next === 'dark');
        try {
            localStorage.setItem(KEY, next);
        } catch {
            // private mode or blocked storage: the switch still works for this visit
        }
        setThemeState(next);
    }, []);
    return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
