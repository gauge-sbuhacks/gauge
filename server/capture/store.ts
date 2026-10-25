import mongoose, { Schema, type Types } from 'mongoose';

interface CapturePhotoDoc {
    ownerId: string;
    contentType: 'image/jpeg' | 'image/webp';
    data: Buffer;
}

const photoSchema = new Schema<CapturePhotoDoc>(
    {
        ownerId: { type: String, required: true },
        contentType: { type: String, required: true, enum: ['image/jpeg', 'image/webp'] },
        data: { type: Buffer, required: true }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);
photoSchema.index({ ownerId: 1, createdAt: -1 });

const CapturePhoto = (mongoose.models.CapturePhoto as mongoose.Model<CapturePhotoDoc>) ?? mongoose.model<CapturePhotoDoc>('CapturePhoto', photoSchema);

export async function saveCapturePhoto(ownerId: string, bytes: Buffer, mime: 'image/jpeg' | 'image/webp'): Promise<{ photoId: string }> {
    const created = await CapturePhoto.create({ ownerId, contentType: mime, data: bytes });
    return { photoId: String(created._id) };
}

export async function readCapturePhoto(ownerId: string, photoId: string): Promise<{ contentType: string; data: Buffer } | null> {
    if (!/^[a-f0-9]{24}$/i.test(photoId)) return null;
    const doc = await CapturePhoto.findOne({ _id: photoId as unknown as Types.ObjectId, ownerId });
    if (!doc) return null;
    return { contentType: doc.contentType, data: doc.data };
}
