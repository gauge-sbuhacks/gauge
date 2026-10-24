// vite config: react + tailwind, the @ aliases, and the /api proxy to the express dev server
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

// the api runs on its own port in dev (npm run dev starts both).
// on vercel the same express app runs as a function behind /api, so the frontend never changes.
const apiProxy = {
    '/api': 'http://localhost:3180'
};

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(root, 'src'),
            '@shared': path.resolve(root, 'shared')
        }
    },
    server: {
        port: 5180,
        proxy: apiProxy
    },
    preview: {
        port: 4180,
        proxy: apiProxy
    }
});
