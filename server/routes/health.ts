// GET /api/health: what is set up and what still needs a key. powers the Setup page.
// it reports booleans and env var NAMES only, never values.

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { HealthResponse } from '../../shared/schemas.js';
import { connectDb } from '../db/connect.js';
import { clerkConfigured, getEnv } from '../env.js';
import { geminiConfigured } from '../capture/identify.js';
import { theWatchApiConfigured } from '../lookups/watches.js';
import { ebayConfigured } from '../marketplace/ebay.js';
import { rentcastConfigured } from '../lookups/rentcast.js';
import { goldHistoryConfigured } from '../history/gold.js';
import { vinauditConfigured } from '../lookups/vinaudit.js';

export async function healthHandler(_req: Request, res: Response) {
    const env = getEnv();

    // ---------- auth ----------
    let auth: HealthResponse['auth'];
    if (clerkConfigured(env)) {
        auth = { mode: 'clerk', message: 'Clerk sign-in is on. Each account only sees its own assets.' };
    } else if (env.clerkSecretKey || env.clerkPublishableKey) {
        auth = { mode: 'misconfigured', message: 'Only one of the two Clerk keys is set. Add both CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.' };
    } else if (env.allowDevAuth) {
        auth = { mode: 'dev', message: 'No Clerk keys yet, so everyone is the local dev user. Fine on your machine, not for real data online.' };
    } else {
        auth = { mode: 'misconfigured', message: 'Sign-in is not set up on this deployment (missing Clerk keys).' };
    }

    // ---------- database ----------
    let database: HealthResponse['database'];
    if (!env.mongoUri) {
        database = { configured: false, connected: false, kind: 'none', message: 'MONGODB_URI is not set.' };
    } else {
        const kind = env.mongoIsLocal ? 'local' : 'remote';
        try {
            await connectDb();
            database = {
                configured: true,
                connected: mongoose.connection.readyState === 1,
                kind,
                message: kind === 'local' ? 'Connected to MongoDB on this computer.' : 'Connected to MongoDB (MONGODB_URI).'
            };
        } catch {
            database = {
                configured: true,
                connected: false,
                kind,
                message: kind === 'local' ? "Can't reach MongoDB on this computer. Is the MongoDB service running?" : "Can't reach the database at MONGODB_URI."
            };
        }
    }

    // ---------- data providers ----------
    const providers: HealthResponse['providers'] = [
        { id: 'vehicle_monthly', label: 'Monthly vehicle updates', covers: 'Scheduled VinAudit value snapshots for opted-in vehicles', status: env.vinauditKey && (!env.onVercel || env.cronSecret) ? 'ready' : 'needs_key', envVar: env.onVercel ? 'CRON_SECRET + VINAUDIT_API_KEY' : 'VINAUDIT_API_KEY', note: env.onVercel ? 'Requires the daily cron configuration deployed to Production and CRON_SECRET set there. Credentials present does not verify an active Vercel schedule.' : 'Checks due vehicles at API startup and daily while the local API is running.' },
        { id:'gold_history', label:'Gold API history', covers:'Daily historical metal benchmarks', status:goldHistoryConfigured()?'ready':'needs_key', envVar:'GOLD_API_KEY', note:'Free: 10 history requests/hour, cached per metal for 24 hours. Load on demand.' },
        { id:'magic_history', label:'MTGJSON history', covers:'Magic card prices by exact printing and finish', status:'ready', envVar:null, note:'Free download; no key. Run the separate history import after adding matching cards.' },
        { id: 'ebay', label: 'eBay', covers: 'Comparable active listings for US items in USD', status: ebayConfigured() ? 'ready' : 'needs_key', envVar: 'EBAY_CLIENT_ID + EBAY_CLIENT_SECRET', note: 'Production Browse API access required. Asking prices, not completed sales.' },
        { id: 'photos', label: 'Photos', covers: 'Phone photos for the signed-in account', status: 'ready', envVar: null, note: 'Stored in MongoDB and served only to the account that captured them.' },
        { id: 'gemini', label: 'Gemini', covers: 'Identify a belonging from photos and estimate fair market when no provider price exists', status: geminiConfigured() ? 'ready' : 'needs_key', envVar: 'GEMINI_API_KEY', note: 'Picks the category, then answers that category\'s questions. A short price check fills fair market only when a lookup did not.' },
        { id: 'thewatchapi', label: 'The Watch API', covers: 'Watch reference search and asking-price averages', status: theWatchApiConfigured() ? 'ready' : 'needs_key', envVar: 'THEWATCH_API_KEY', note: 'Reference and model search on all plans. Price history endpoints may require a paid plan; Gemini can estimate fair market when prices are unavailable.' },
        {
            id: 'nhtsa_vpic',
            label: 'NHTSA vPIC',
            covers: 'Vehicle VIN decoding (specs, no prices)',
            status: 'ready',
            envVar: null,
            note: 'Free government API. No key needed.'
        },
        {
            id: 'nhtsa_recalls',
            label: 'NHTSA Recalls',
            covers: 'Vehicle recalls by make, model, and year',
            status: 'ready',
            envVar: null,
            note: 'Free government API. No key needed.'
        },
        {
            id: 'rentcast',
            label: 'RentCast',
            covers: 'Home value estimates with nearby comparables',
            status: rentcastConfigured() ? 'ready' : 'needs_key',
            envVar: 'RENTCAST_API_KEY',
            note: 'Free plan is 50 requests a month. Built, but untested until a key is added.'
        },
        {
            id: 'vinaudit',
            label: 'VinAudit',
            covers: 'Vehicle retail and trade-in values by VIN or year, make, model, and optional trim',
            status: vinauditConfigured() ? 'ready' : 'needs_key',
            envVar: 'VINAUDIT_API_KEY',
            note: 'Enable Market Values. VIN-free estimates also need Specifications / Vehicle Selections. Two price requests plus one cached selections request without a VIN.'
        },
        {
            id: 'cards',
            label: 'TCGdex / Scryfall',
            covers: 'Pokémon and Magic card prices (TCGplayer market, ungraded)',
            status: 'ready',
            envVar: null,
            note: 'Free, no key. TCGdex replaces the Pokémon TCG API, which was failing when tested.'
        },
        {
            id: 'metals',
            label: 'gold-api.com',
            covers: 'Gold, silver, platinum, and palladium melt value (spot x weight x purity)',
            status: 'ready',
            envVar: null,
            note: 'Free, no key. Live spot prices.'
        },
    ];

    const ok = auth.mode !== 'misconfigured' && database.connected;
    const body: HealthResponse = { ok, auth, database, providers };
    res.status(ok ? 200 : 503).json(body);
}
