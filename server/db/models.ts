// mongoose models: assets, and valuation snapshots (dated observations of what an asset is worth).
// every document carries ownerId, and every query in the routes filters on it.

import mongoose, { Schema, type Types } from 'mongoose';
import { CATEGORY_IDS, type CategoryId, type Details } from '../../shared/categories.js';
import {
    CONDITIONS,
    INSURANCE_STATUSES,
    OBSERVED_VALUE_TYPES,
    PURPOSES,
    VALUATION_SOURCES,
    type AssetRecord,
    type Condition,
    type InsuranceStatus,
    type ObservedValueType,
    type ProfileRecord,
    type Purpose,
    type ValuationRecord,
    type ValuationSource
} from '../../shared/schemas.js';
import { SUPPORTED_CURRENCIES, type Currency } from '../../shared/money.js';

// ---------- assets ----------

export interface AssetDoc {
    ownerId: string;
    name: string;
    category: CategoryId;
    brand: string | null;
    model: string | null;
    location: string | null;
    condition: Condition | null;
    purchaseDate: string | null;
    purchasePriceCents: number | null;
    currency: Currency;
    serialNumber: string | null;
    insurance: InsuranceStatus | null;
    insuranceNote: string | null;
    notes: string | null;
    details: Details;
    isSample: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const nullableString = { type: String, default: null };
const wholeCents = {
    validator: (v: number | null) => v == null || Number.isInteger(v),
    message: 'amounts are stored as whole cents'
};

const assetSchema = new Schema<AssetDoc>(
    {
        ownerId: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        category: { type: String, required: true, enum: CATEGORY_IDS },
        brand: nullableString,
        model: nullableString,
        location: nullableString,
        condition: { type: String, enum: [...CONDITIONS, null], default: null },
        // date-only strings (YYYY-MM-DD) so time zones can never shift a purchase date
        purchaseDate: nullableString,
        purchasePriceCents: { type: Number, default: null, min: 0, validate: wholeCents },
        currency: { type: String, enum: SUPPORTED_CURRENCIES, default: 'USD' },
        serialNumber: nullableString,
        insurance: { type: String, enum: [...INSURANCE_STATUSES, null], default: null },
        insuranceNote: nullableString,
        notes: nullableString,
        details: { type: Schema.Types.Mixed, default: {} },
        isSample: { type: Boolean, default: false }
    },
    // minimize: false keeps an empty details object instead of dropping it
    { timestamps: true, minimize: false }
);

assetSchema.index({ ownerId: 1, updatedAt: -1 });

export const Asset = (mongoose.models.Asset as mongoose.Model<AssetDoc>) ?? mongoose.model<AssetDoc>('Asset', assetSchema);

// ---------- valuation snapshots ----------

export interface ValuationDoc {
    ownerId: string;
    assetId: Types.ObjectId;
    valueType: ObservedValueType;
    amountCents: number | null;
    lowCents: number | null;
    highCents: number | null;
    currency: Currency;
    observedAt: string;
    source: ValuationSource;
    sourceName: string | null;
    method: string | null;
    conditionAssumption: Condition | null;
    notes: string | null;
    createdAt: Date;
}

const valuationSchema = new Schema<ValuationDoc>(
    {
        ownerId: { type: String, required: true },
        assetId: { type: Schema.Types.ObjectId, required: true, ref: 'Asset' },
        valueType: { type: String, required: true, enum: OBSERVED_VALUE_TYPES },
        amountCents: { type: Number, default: null, min: 0, validate: wholeCents },
        lowCents: { type: Number, default: null, min: 0, validate: wholeCents },
        highCents: { type: Number, default: null, min: 0, validate: wholeCents },
        currency: { type: String, enum: SUPPORTED_CURRENCIES, default: 'USD' },
        observedAt: { type: String, required: true },
        source: { type: String, enum: VALUATION_SOURCES, default: 'user' },
        sourceName: nullableString,
        method: nullableString,
        conditionAssumption: { type: String, enum: [...CONDITIONS, null], default: null },
        notes: nullableString
    },
    // observations are append-only, so only createdAt matters
    { timestamps: { createdAt: true, updatedAt: false }, collection: 'valuationSnapshots' }
);

valuationSchema.index({ ownerId: 1, assetId: 1, observedAt: -1 });

export const Valuation =
    (mongoose.models.Valuation as mongoose.Model<ValuationDoc>) ?? mongoose.model<ValuationDoc>('Valuation', valuationSchema);

// ---------- profiles (one per owner, written by onboarding) ----------

export interface ProfileDoc {
    ownerId: string;
    name: string;
    occupation: string | null;
    purpose: Purpose;
    onboardedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const profileSchema = new Schema<ProfileDoc>(
    {
        ownerId: { type: String, required: true, unique: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        occupation: nullableString,
        purpose: { type: String, required: true, enum: PURPOSES },
        onboardedAt: { type: Date, required: true }
    },
    { timestamps: true }
);

export const Profile = (mongoose.models.Profile as mongoose.Model<ProfileDoc>) ?? mongoose.model<ProfileDoc>('Profile', profileSchema);

// ---------- doc -> api record ----------

export type WithId<T> = T & { _id: Types.ObjectId };

export function toAssetRecord(doc: WithId<AssetDoc>): AssetRecord {
    return {
        id: String(doc._id),
        name: doc.name,
        category: doc.category,
        brand: doc.brand ?? null,
        model: doc.model ?? null,
        location: doc.location ?? null,
        condition: doc.condition ?? null,
        purchaseDate: doc.purchaseDate ?? null,
        purchasePriceCents: doc.purchasePriceCents ?? null,
        currency: doc.currency ?? 'USD',
        serialNumber: doc.serialNumber ?? null,
        insurance: doc.insurance ?? null,
        insuranceNote: doc.insuranceNote ?? null,
        notes: doc.notes ?? null,
        details: doc.details ?? {},
        isSample: Boolean(doc.isSample),
        createdAt: new Date(doc.createdAt).toISOString(),
        updatedAt: new Date(doc.updatedAt).toISOString()
    };
}

export function toProfileRecord(doc: ProfileDoc): ProfileRecord {
    return {
        name: doc.name,
        occupation: doc.occupation ?? null,
        purpose: doc.purpose,
        onboardedAt: new Date(doc.onboardedAt).toISOString()
    };
}

export function toValuationRecord(doc: WithId<ValuationDoc>): ValuationRecord {
    return {
        id: String(doc._id),
        assetId: String(doc.assetId),
        valueType: doc.valueType,
        amountCents: doc.amountCents ?? null,
        lowCents: doc.lowCents ?? null,
        highCents: doc.highCents ?? null,
        currency: doc.currency ?? 'USD',
        observedAt: doc.observedAt,
        source: doc.source ?? 'user',
        sourceName: doc.sourceName ?? null,
        method: doc.method ?? null,
        conditionAssumption: doc.conditionAssumption ?? null,
        notes: doc.notes ?? null,
        createdAt: new Date(doc.createdAt).toISOString()
    };
}
