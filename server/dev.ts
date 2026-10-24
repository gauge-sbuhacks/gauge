// local api server for `npm run dev`. vite (port 5180) proxies /api here.
// loads .env.local / .env first, then imports the app (so the app sees the variables).

import fs from 'node:fs';

for (const file of ['.env.local', '.env']) {
    if (fs.existsSync(file)) process.loadEnvFile(file);
}

const { default: app } = await import('./app.js');
const { getEnv, clerkConfigured } = await import('./env.js');
const { connectDb } = await import('./db/connect.js');

const port = Number(process.env.API_PORT ?? 3180);
const env = getEnv();

app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
    console.log(`[api] auth: ${clerkConfigured(env) ? 'clerk' : 'local dev user (no clerk keys)'}`);
    console.log(`[api] database: ${env.mongoIsLocal ? 'local mongodb' : env.mongoUri ? 'MONGODB_URI' : 'not configured'}`);
    connectDb()
        .then(() => console.log('[api] mongodb connected'))
        .catch((err) => console.log(`[api] ${err.message}`));
});
