import { createHash } from 'node:crypto';
import type { AssetRecord } from '../../shared/schemas.js';
import { normalizeHistory, type HistoricalSeries, type HistoryResponse } from '../../shared/history.js';
import { parsePurity } from '../lookups/metals.js';
import { HttpError } from '../errors.js';
import { HistoryBudget, HistoryCache } from './models.js';

const symbols: Record<string,string> = {gold:'XAU',silver:'XAG',platinum:'XPT',palladium:'XPD'};
export const goldHistoryConfigured = () => !!process.env.GOLD_API_KEY?.trim();

export function metalHistoryDetails(asset:AssetRecord) {
    const symbol=symbols[String(asset.details.metal)];
    const weight=asset.details.weightGrams;
    const purity=parsePurity(String(asset.details.purity ?? ''));
    if (!symbol || typeof weight!=='number' || !Number.isFinite(weight) || weight<=0 || purity==null) return null;
    return {symbol,fineOunces:weight/31.1034768*purity};
}

export function goldHistorySeries(raw:unknown,symbol:string,now=new Date()):HistoricalSeries {
    if (!Array.isArray(raw)) throw new HttpError(502,'provider_error','Gold API returned an unreadable history.');
    const points=normalizeHistory(raw.filter(row => row && typeof row==='object').map(row=>({date:row.day,value:row.avg_price})),now.toISOString().slice(0,10));
    if (!points.length) throw new HttpError(404,'no_history','No historical prices are available for this metal.');
    return {id:`gold:${symbol}`,label:`${symbol} daily benchmark`,basis:'metal_benchmark',currency:'USD',points,
        source:'gold-api.com',sourceUrl:'https://gold-api.com',fetchedAt:now.toISOString(),
        note:'Daily average spot prices in USD per troy ounce. Not completed sales.'};
}

// One atomic rolling-hour ledger is shared across users and server instances for this key.
export async function reserveGoldRequest(key:string,now=new Date()) {
    const id=`gold:${createHash('sha256').update(key).digest('hex')}`;
    const recent={$filter:{input:{$ifNull:['$requests',[]]},as:'time',cond:{$gt:['$$time',new Date(now.getTime()-3600000)]}}};
    try {
        // Initialize separately: MongoDB does not allow $expr in an upsert predicate.
        try {await HistoryBudget.updateOne({_id:id},{$setOnInsert:{requests:[]}},{upsert:true});}
        catch(err) {if((err as {code?:number}).code!==11000) throw err;}
        const entry=await HistoryBudget.findOneAndUpdate({_id:id,$expr:{$lt:[{$size:recent},10]}},
            [{$set:{requests:{$concatArrays:[recent,[now]]}}}],{returnDocument:'after',updatePipeline:true});
        if (!entry) throw new Error('quota');
    } catch (err) {
        if ((err as {code?:number}).code===11000 || (err as Error).message==='quota')
            throw new HttpError(429,'history_quota','The free metal-history allowance is used up for this hour. Try again later.');
        throw err; // Fail closed if the shared quota ledger is unavailable.
    }
}

export async function metalHistory(asset:AssetRecord,refresh:boolean):Promise<HistoryResponse> {
    const details=metalHistoryDetails(asset);
    if (!details) return {available:true,status:'needs_details',message:'Add the metal, total weight, and purity to see its history.',series:[]};
    const cacheId=`gold:${details.symbol}:daily:365`;
    const cached=await HistoryCache.findById(cacheId).lean();
    let series=cached?.series;
    if (refresh && (!cached || cached.expiresAt.getTime()<Date.now())) {
        const key=process.env.GOLD_API_KEY?.trim();
        if (!key) return {available:true,status:'needs_key',message:'Connect the free metal-history source in Setup.',series:[]};
        await reserveGoldRequest(key);
        const now=new Date();
        const end=Math.floor(now.getTime()/1000);
        const params=new URLSearchParams({symbol:details.symbol,startTimestamp:String(end-365*86400),endTimestamp:String(end),groupBy:'day',aggregation:'avg',orderBy:'asc'});
        let res:Response;
        try {res=await fetch(`https://api.gold-api.com/history?${params}`,{headers:{'x-api-key':key,accept:'application/json'},signal:AbortSignal.timeout(15000)});}
        catch {throw new HttpError(502,'provider_unreachable','The metal-history source did not respond. Saved prices are still available. Try again later.');}
        if (!res.ok) throw new HttpError(res.status===429?429:502,'provider_error',res.status===429?'The free history source is rate limited. Try again later.':'Metal history is temporarily unavailable. Check the connection in Setup.');
        let raw:unknown;
        try {raw=await res.json();} catch {throw new HttpError(502,'provider_error','The metal-history source returned an unreadable response.');}
        series=goldHistorySeries(raw,details.symbol,now);
        await HistoryCache.findOneAndUpdate({_id:cacheId},{$set:{series,expiresAt:new Date(now.getTime()+86400000)}},{upsert:true,runValidators:true});
    }
    if (!series) return {available:true,status:goldHistoryConfigured()?'not_loaded':'needs_key',message:goldHistoryConfigured()?'Load the last year of metal benchmark prices.':'Connect the free metal-history source in Setup.',series:[]};
    return {available:true,status:'ready',message:'Metal content value, based on your current weight and purity.',series:[{...series,
        label:'Metal content value',id:`${series.id}:content`,points:series.points.map(p=>({...p,valueCents:Math.round(p.valueCents*details.fineOunces)})),
        note:'Historical metal benchmark × your current weight and purity. Excludes design, gemstones, premiums, and selling costs. Not the resale price of the finished item.'}]};
}
