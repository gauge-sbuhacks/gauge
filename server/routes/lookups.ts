// optional lookup actions. they only return suggestions; the frontend shows them and the user
// decides what to apply, so a provider can never silently overwrite confirmed data.
// these are POSTs (not GETs) so vins and addresses stay out of urls and access logs.

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import {
    cardPriceQuerySchema,
    metalValueQuerySchema,
    suggestValuesQuerySchema,
    vehicleValueQuerySchema,
    watchSearchQuerySchema,
    watchValueQuerySchema
} from '../../shared/schemas.js';
import { suggestValuesForAsset } from '../capture/suggest.js';
import { cleanDetails } from './assets.js';
import { ownerIdOf } from '../auth.js';
import { HttpError } from '../errors.js';
import { makeRateLimiter } from '../lookups/cache.js';
import { lookupCardPrices } from '../lookups/cards.js';
import { lookupMetalValue } from '../lookups/metals.js';
import { decodeVin, lookupRecalls } from '../lookups/nhtsa.js';
import { lookupPropertyValue } from '../lookups/rentcast.js';
import { lookupVehicleValue } from '../lookups/vinaudit.js';
import { lookupWatchValue, searchWatchMatches } from '../lookups/watches.js';

export const lookupsRouter = Router();

// 30 lookups a minute per user is plenty for a person and stops runaway loops
const allow = makeRateLimiter(30, 60_000);
lookupsRouter.use('/lookups', (_req, res, next) => {
    if (!allow(ownerIdOf(res))) return next(new HttpError(429, 'rate_limited', 'Too many lookups at once. Wait a minute and try again.'));
    next();
});

// lookups that cost money or have a small free quota get their own, tighter cap per person
const HOUR = 60 * 60_000;
function limit(count: number, windowMs: number, message: string): RequestHandler {
    const allowed = makeRateLimiter(count, windowMs);
    return (_req, res, next) => (allowed(ownerIdOf(res)) ? next() : next(new HttpError(429, 'rate_limited', message)));
}
const homeLimit = limit(5, HOUR, 'Home estimates are limited to 5 an hour. Try again later.');
const vehicleLimit = limit(10, HOUR, 'Vehicle estimates are limited to 10 an hour. Try again later.');
const priceCheckLimit = limit(20, 10 * 60_000, 'Too many price checks in a row. Wait a few minutes and try again.');
const watchLimit = limit(10, HOUR, 'Watch lookups are limited to 10 an hour. Try again later.');

const vinBody = z.object({ vin: z.string().trim().min(1, 'Enter a VIN') });

lookupsRouter.post('/lookups/vin', async (req, res) => {
    const { vin } = vinBody.parse(req.body);
    res.json(await decodeVin(vin));
});

const recallBody = z.object({
    make: z.string().trim().min(1, 'Add the make first'),
    model: z.string().trim().min(1, 'Add the model first'),
    year: z.number({ error: 'Add the model year first' }).int().min(1950).max(new Date().getFullYear() + 2)
});

lookupsRouter.post('/lookups/recalls', async (req, res) => {
    const { make, model, year } = recallBody.parse(req.body);
    res.json(await lookupRecalls(make, model, year));
});

const propertyBody = z.object({
    addressLine1: z.string().trim().min(1, 'Add the street address'),
    city: z.string().trim().min(1, 'Add the city'),
    state: z.string().trim().min(2, 'Add the state'),
    postalCode: z.string().trim().nullish(),
    propertyType: z.string().nullish(),
    bedrooms: z.number().nullish(),
    bathrooms: z.number().nullish(),
    squareFeet: z.number().nullish()
});

lookupsRouter.post('/lookups/property-value', homeLimit, async (req, res) => {
    const query = propertyBody.parse(req.body);
    res.json(await lookupPropertyValue(query));
});

lookupsRouter.post('/lookups/vehicle-value', vehicleLimit, async (req, res) => {
    res.json(await lookupVehicleValue(vehicleValueQuerySchema.parse(req.body)));
});

lookupsRouter.post('/lookups/card-prices', async (req, res) => {
    res.json(await lookupCardPrices(cardPriceQuerySchema.parse(req.body)));
});

lookupsRouter.post('/lookups/metal-value', async (req, res) => {
    res.json(await lookupMetalValue(metalValueQuerySchema.parse(req.body)));
});

lookupsRouter.post('/lookups/suggest-values', priceCheckLimit, async (req, res) => {
    const q = suggestValuesQuerySchema.parse(req.body);
    const details = cleanDetails(q.category, q.details ?? {});
    res.json(
        await suggestValuesForAsset({
            category: q.category,
            name: q.name,
            brand: q.brand,
            model: q.model,
            condition: q.condition ?? null,
            details
        })
    );
});

// not used by the add flow anymore (The Watch API never returned usable prices); kept for the team
lookupsRouter.post('/lookups/watch-search', watchLimit, async (req, res) => {
    res.json(await searchWatchMatches(watchSearchQuerySchema.parse(req.body)));
});

lookupsRouter.post('/lookups/watch-value', watchLimit, async (req, res) => {
    res.json(await lookupWatchValue(watchValueQuerySchema.parse(req.body)));
});
