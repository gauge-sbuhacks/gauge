// GET /api/health: what is set up and what still needs a key. powers the Setup page.
// it reports booleans and env var NAMES only, never values.

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { HealthResponse } from '../../shared/schemas.js';
import { connectDb } from '../db/connect.js';
import { clerkConfigured, getEnv } from '../env.js';
import { rentcastConfigured } from '../lookups/rentcast.js';

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
            id: 'carapi',
            label: 'CarAPI / VinAudit / MarketCheck',
            covers: 'Vehicle market values',
            status: 'planned',
            envVar: null,
            note: 'Pick one. Pricing and terms still need checking.'
        },
        {
            id: 'ebay',
            label: 'eBay Browse',
            covers: 'Current listing prices for general goods',
            status: 'planned',
            envVar: null,
            note: 'Asking prices only. Sold prices (Marketplace Insights) need eBay approval.'
        },
        {
            id: 'cards',
            label: 'Pokémon TCG API / Scryfall',
            covers: 'Trading card prices',
            status: 'planned',
            envVar: null,
            note: 'Both listed as free in the requirements doc. Not verified yet.'
        },
        {
            id: 'metals',
            label: 'Metals.dev / GoldAPI',
            covers: 'Gold and silver spot prices (value = spot x weight x purity)',
            status: 'planned',
            envVar: null,
            note: 'Free or trial tiers per the requirements doc. Not verified yet.'
        },
        {
            id: 'claude_vision',
            label: 'Claude vision',
            covers: 'Photo-based identification (last phase)',
            status: 'planned',
            envVar: null,
            note: 'Waits until photo uploads exist.'
        }
    ];

    const ok = auth.mode !== 'misconfigured' && database.connected;
    const body: HealthResponse = { ok, auth, database, providers };
    res.status(ok ? 200 : 503).json(body);
}
