// who is calling? with clerk keys set, the clerk session token decides. without them (local dev),
// everyone is the "local dev user" so the app works before any accounts exist.
// every route reads the owner id from here and every query filters by it.

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { clerkConfigured, getEnv } from './env.js';
import { HttpError } from './errors.js';

const DEV_USER_HEADER = 'x-gauge-dev-user';

// clerk's middleware only when it's configured. it verifies the bearer token the frontend sends
export function authMiddleware(): RequestHandler[] {
    const env = getEnv();
    if (!clerkConfigured(env)) return [];
    return [clerkMiddleware({ secretKey: env.clerkSecretKey!, publishableKey: env.clerkPublishableKey! })];
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
    const env = getEnv();

    if (clerkConfigured(env)) {
        const { userId } = getAuth(req);
        if (!userId) return next(new HttpError(401, 'unauthenticated', 'Sign in to continue.'));
        res.locals.userId = `clerk:${userId}`;
        return next();
    }

    if (!env.allowDevAuth) {
        return next(new HttpError(503, 'auth_not_configured', 'Sign-in is not set up on this deployment yet (missing Clerk keys).'));
    }

    // dev mode. the header lets us test that two users can't see each other's assets
    const raw = req.header(DEV_USER_HEADER);
    const devName = raw && /^[a-z0-9-]{1,32}$/i.test(raw) ? raw.toLowerCase() : 'local';
    res.locals.userId = `dev:${devName}`;
    next();
}

export function ownerIdOf(res: Response): string {
    const id = res.locals.userId;
    if (typeof id !== 'string' || id === '') throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');
    return id;
}
