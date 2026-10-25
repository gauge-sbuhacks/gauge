import { createHash, randomBytes } from 'node:crypto';

export function newCaptureToken(): string {
    return randomBytes(32).toString('base64url');
}

export function hashCaptureToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function validTokenShape(token: string): boolean {
    return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}
