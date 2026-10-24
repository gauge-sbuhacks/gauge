// the signed-in person's profile: name, occupation, and why they use gauge.
// no profile yet means onboarding hasn't been finished, and the site sends them there.

import { Router } from 'express';
import { profileInputSchema, type ProfileResponse } from '../../shared/schemas.js';
import { ownerIdOf } from '../auth.js';
import { withDb } from '../db/connect.js';
import { Profile, toProfileRecord, type ProfileDoc } from '../db/models.js';

export const profileRouter = Router();
profileRouter.use(withDb);

profileRouter.get('/profile', async (_req, res) => {
    const doc = await Profile.findOne({ ownerId: ownerIdOf(res) }).lean<ProfileDoc>();
    const body: ProfileResponse = { profile: doc ? toProfileRecord(doc) : null };
    res.json(body);
});

// create or replace. onboardedAt keeps the first completion date when the answers are edited later
profileRouter.put('/profile', async (req, res) => {
    const ownerId = ownerIdOf(res);
    const input = profileInputSchema.parse(req.body);
    const doc = await Profile.findOneAndUpdate(
        { ownerId },
        {
            $set: { name: input.name, occupation: input.occupation ?? null, purpose: input.purpose },
            $setOnInsert: { ownerId, onboardedAt: new Date() }
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean<ProfileDoc>();
    const body: ProfileResponse = { profile: doc ? toProfileRecord(doc) : null };
    res.json(body);
});
