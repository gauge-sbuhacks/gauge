// reads environment variables in one place. read lazily (a function, not constants)
// so the dev server can load .env.local before anything asks for a value.

export interface Env {
    onVercel: boolean;
    mongoUri: string | null;
    mongoIsLocal: boolean;
    clerkSecretKey: string | null;
    clerkPublishableKey: string | null;
    allowDevAuth: boolean;
    rentcastKey: string | null;
}

const LOCAL_MONGO = 'mongodb://127.0.0.1:27017/gauge';

function read(name: string): string | null {
    const v = process.env[name];
    return v && v.trim() !== '' ? v.trim() : null;
}

export function getEnv(): Env {
    const onVercel = process.env.VERCEL === '1';

    // locally we fall back to the mongodb service on this machine. on vercel there is no fallback
    const mongoUri = read('MONGODB_URI') ?? (onVercel ? null : LOCAL_MONGO);
    const mongoIsLocal = mongoUri != null && /127\.0\.0\.1|localhost/.test(mongoUri);

    return {
        onVercel,
        mongoUri,
        mongoIsLocal,
        clerkSecretKey: read('CLERK_SECRET_KEY'),
        clerkPublishableKey: read('CLERK_PUBLISHABLE_KEY') ?? read('VITE_CLERK_PUBLISHABLE_KEY'),
        // the "local dev user" only works on your own machine, unless you opt in on a preview deploy
        allowDevAuth: !onVercel || read('GAUGE_ALLOW_DEV_AUTH') === 'true',
        rentcastKey: read('RENTCAST_API_KEY')
    };
}

export function clerkConfigured(env = getEnv()): boolean {
    return env.clerkSecretKey != null && env.clerkPublishableKey != null;
}
