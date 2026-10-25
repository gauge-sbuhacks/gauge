// the express app. the same app runs two ways:
//   - locally: server/dev.ts listens on a port and vite proxies /api to it
//   - on vercel: api/index.ts exports it as a function, and vercel.json rewrites /api/* to it

import express from 'express';
import { authMiddleware, requireUser } from './auth.js';
import { HttpError, errorHandler } from './errors.js';
import { capturePublicRouter, captureRouter } from './routes/capture.js';
import { historyRouter } from './routes/history.js';
import { marketplaceRouter } from './routes/marketplace.js';
import { assetsRouter } from './routes/assets.js';
import { healthHandler } from './routes/health.js';
import { lookupsRouter } from './routes/lookups.js';
import { profileRouter } from './routes/profile.js';
import { sampleRouter } from './routes/sample.js';
import { vehicleCronRouter, vehicleUpdatesRouter } from './routes/vehicle-updates.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

const jsonSmall = express.json({ limit: '200kb' });
const jsonPhoto = express.json({ limit: '6mb' });
app.use((req, res, next) => {
    if (req.method === 'POST' && /^\/api\/capture\/[^/]+\/photos$/.test(req.path)) return jsonPhoto(req, res, next);
    return jsonSmall(req, res, next);
});

// this is private data. never let a browser or cdn cache an api response
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// public: tells the Setup page what is configured (names and booleans only)
app.get('/api/health', healthHandler);
app.use('/api/cron', vehicleCronRouter);

// the QR token is the phone's credential. it belongs to the desktop user's session.
app.use('/api', capturePublicRouter);

// everything below needs a user
app.use('/api', ...authMiddleware(), requireUser);
app.use('/api', captureRouter);
app.use('/api', profileRouter);
app.use('/api', assetsRouter);
app.use('/api', vehicleUpdatesRouter);
app.use('/api', marketplaceRouter);
app.use('/api', historyRouter);
app.use('/api', sampleRouter);
app.use('/api', lookupsRouter);

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'No such API route.')));
app.use(errorHandler);

export default app;
