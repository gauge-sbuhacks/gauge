// optional lookup actions. they only return suggestions; the frontend shows them and the user
// decides what to apply, so a provider can never silently overwrite confirmed data.
// these are POSTs (not GETs) so vins and addresses stay out of urls and access logs.

import { Router } from 'express';
import { z } from 'zod';
import { ownerIdOf } from '../auth.js';
import { HttpError } from '../errors.js';
import { makeRateLimiter } from '../lookups/cache.js';
import { decodeVin, lookupRecalls } from '../lookups/nhtsa.js';
import { lookupPropertyValue } from '../lookups/rentcast.js';

export const lookupsRouter = Router();

// 30 lookups a minute per user is plenty for a person and stops runaway loops
const allow = makeRateLimiter(30, 60_000);
lookupsRouter.use('/lookups', (_req, res, next) => {
    if (!allow(ownerIdOf(res))) return next(new HttpError(429, 'rate_limited', 'Too many lookups at once. Wait a minute and try again.'));
    next();
});

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

lookupsRouter.post('/lookups/property-value', async (req, res) => {
    const query = propertyBody.parse(req.body);
    res.json(await lookupPropertyValue(query));
});
