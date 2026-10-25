import mongoose, { Schema } from 'mongoose';
import type { HistoricalSeries } from '../../shared/history.js';

interface CacheDoc { _id:string; series:HistoricalSeries; expiresAt:Date; }
const cacheSchema = new Schema<CacheDoc>({ _id:String, series:{type:Schema.Types.Mixed,required:true}, expiresAt:{type:Date,required:true} });
export const HistoryCache = (mongoose.models.HistoryCache as mongoose.Model<CacheDoc>) ?? mongoose.model<CacheDoc>('HistoryCache',cacheSchema);

interface BudgetDoc { _id:string; requests:Date[]; }
const budgetSchema = new Schema<BudgetDoc>({ _id:String, requests:{type:[Date],default:[]} });
export const HistoryBudget = (mongoose.models.HistoryBudget as mongoose.Model<BudgetDoc>) ?? mongoose.model<BudgetDoc>('HistoryBudget',budgetSchema);

interface SnapshotDoc { ownerId:string;assetId:string;version:string;date:string;valueCents:number;fetchedAt:string; }
const snapshotSchema = new Schema<SnapshotDoc>({ ownerId:{type:String,required:true},assetId:{type:String,required:true},version:{type:String,required:true},date:String,valueCents:Number,fetchedAt:String });
snapshotSchema.index({ownerId:1,assetId:1,version:1,date:1},{unique:true});
export const ResearchSnapshot = (mongoose.models.ResearchSnapshot as mongoose.Model<SnapshotDoc>) ?? mongoose.model<SnapshotDoc>('ResearchSnapshot',snapshotSchema);

interface MagicDoc { _id:string;series:HistoricalSeries[];importedAt:Date; }
const magicSchema = new Schema<MagicDoc>({ _id:String,series:{type:Schema.Types.Mixed,required:true},importedAt:Date });
export const MagicHistory = (mongoose.models.MagicHistory as mongoose.Model<MagicDoc>) ?? mongoose.model<MagicDoc>('MagicHistory',magicSchema);
