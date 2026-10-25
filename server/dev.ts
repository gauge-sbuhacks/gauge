// local api server for `npm run dev`. vite (port 5180) proxies /api here.
// loads .env.local / .env first, then imports the app (so the app sees the variables).

import fs from 'node:fs';

for (const file of ['.env.local', '.env']) {
    if (fs.existsSync(file)) process.loadEnvFile(file);
}

const { default: app } = await import('./app.js');
const { getEnv, clerkConfigured } = await import('./env.js');
const { connectDb } = await import('./db/connect.js');
const { runMonthlyVehicleRefreshes } = await import('./vehicles/monthly.js');

// Local development has no hosting scheduler. Check due vehicles while the API is running.
let refreshingVehicles = false;
async function refreshDueVehicles() {
    if (refreshingVehicles || !getEnv().vinauditKey) return;
    refreshingVehicles = true;
    try {
        const result = await runMonthlyVehicleRefreshes();
        if (result.updated || result.failed) console.log('[api] monthly vehicle updates:', result);
    } catch {
        console.log('[api] monthly vehicle check could not complete; saved values were kept.');
    } finally { refreshingVehicles = false; }
}

const port = Number(process.env.API_PORT ?? 3180);
const env = getEnv();

app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
    console.log(`[api] auth: ${clerkConfigured(env) ? 'clerk' : 'local dev user (no clerk keys)'}`);
    console.log(`[api] database: ${env.mongoIsLocal ? 'local mongodb' : env.mongoUri ? 'MONGODB_URI' : 'not configured'}`);
    connectDb()
        .then(() => {
            console.log('[api] mongodb connected');
            void refreshDueVehicles();
            setInterval(() => { void refreshDueVehicles(); }, 24 * 60 * 60_000).unref();
        })
        .catch((err) => console.log(`[api] ${err.message}`));
});
