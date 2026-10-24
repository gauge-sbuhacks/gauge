// mongoose connection, cached across requests. on vercel the same function instance
// handles many requests, so we connect once and reuse it instead of reconnecting every time.

import mongoose from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { getEnv } from '../env.js';
import { HttpError } from '../errors.js';

let pending: Promise<typeof mongoose> | null = null;

export function connectDb(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
    if (pending) return pending;

    const { mongoUri } = getEnv();
    if (!mongoUri) {
        return Promise.reject(new HttpError(503, 'db_not_configured', 'The database is not set up yet (missing MONGODB_URI).'));
    }

    pending = mongoose
        .connect(mongoUri, { serverSelectionTimeoutMS: 5000 })
        .catch((err) => {
            // forget the failed attempt so the next request tries again
            pending = null;
            console.error('[db] connection failed:', err?.message ?? err);
            throw new HttpError(503, 'db_unreachable', "Can't reach the database right now. Is MongoDB running?");
        });
    return pending;
}

// route middleware: make sure we're connected before touching models
export async function withDb(_req: Request, _res: Response, next: NextFunction) {
    try {
        await connectDb();
        next();
    } catch (err) {
        next(err);
    }
}
