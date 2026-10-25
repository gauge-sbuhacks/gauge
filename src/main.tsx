// entry point: fonts, global css, then the app.
// Barlow and Big Shoulders load from google fonts (index.html); Geist Mono (serial plates) is bundled

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist-mono';
import './css/index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
