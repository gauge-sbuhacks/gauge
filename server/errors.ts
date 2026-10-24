// error types and the one express error handler that turns them into json.
// the frontend reads { error, message, fieldErrors } so validation messages land next to the right input.

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
    status: number;
    code: string;
    fieldErrors?: Record<string, string>;

    constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
        super(message);
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors;
    }
}

export const notFound = (what = 'That item') => new HttpError(404, 'not_found', `${what} was not found.`);

// zod issues -> { 'details.vin': 'message' }. first message per field wins
export function zodFieldErrors(err: ZodError, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const issue of err.issues) {
        const key = prefix + issue.path.map(String).join('.') || '_form';
        if (!(key in out)) out[key] = issue.message;
    }
    return out;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
        res.status(400).json({ error: 'validation', message: 'Some fields need attention.', fieldErrors: zodFieldErrors(err) });
        return;
    }
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.code, message: err.message, fieldErrors: err.fieldErrors });
        return;
    }
    // express.json() throws these for bad bodies
    if (err?.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'bad_json', message: 'The request body was not valid JSON.' });
        return;
    }
    if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'too_large', message: 'That request was too large.' });
        return;
    }

    // anything else is our bug. log it, but never send internals (or data) back
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong on our side. Try again.' });
};
