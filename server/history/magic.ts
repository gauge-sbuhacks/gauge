import type { AssetRecord } from '../../shared/schemas.js';
import { normalizeHistory, type HistoricalSeries, type HistoryResponse } from '../../shared/history.js';
import { MagicHistory } from './models.js';

export function magicIdentity(asset:AssetRecord) {
    const set=String(asset.details.setCode ?? '').trim().toUpperCase();
    const number=String(asset.details.cardNumber ?? '').split('/')[0].trim().replace(/^0+(?=\d)/,'');
    const finish=String(asset.details.finish ?? '');
    if (!/^[A-Z0-9]{2,8}$/.test(set) || !/^[\w★-]{1,20}$/.test(number) || !['normal','foil','etched'].includes(finish)) return null;
    return {set,number,finish,key:`${set}:${number}:${finish}`};
}

export function magicSeries(raw:unknown,uuid:string,finish:string,now=new Date()):HistoricalSeries[] {
    const paper=(raw as {paper?:Record<string,{currency?:string;retail?:Record<string,Record<string,number>>}>})?.paper;
    const result:HistoricalSeries[]=[];
    for (const provider of ['tcgplayer','cardkingdom','cardsphere']) {
        const data=paper?.[provider];
        if (data?.currency!=='USD') continue;
        const prices=data.retail?.[finish];
        if (!prices) continue;
        const points=normalizeHistory(Object.entries(prices).map(([date,value])=>({date,value})),now.toISOString().slice(0,10));
        if (!points.length) continue;
        result.push({id:`mtgjson:${uuid}:${provider}:${finish}`,label:`${provider==='tcgplayer'?'TCGplayer':provider==='cardkingdom'?'Card Kingdom':'Cardsphere'} · ${finish==='normal'?'Nonfoil':finish==='foil'?'Foil':'Etched foil'}`,
            basis:'retail',currency:'USD',points,source:`${provider} via MTGJSON`,sourceUrl:'https://mtgjson.com',fetchedAt:now.toISOString(),
            note:'Recorded market/retail prices for this exact printing and finish, in ungraded condition. Not individual completed sales.'});
    }
    return result;
}

export async function magicHistory(asset:AssetRecord):Promise<HistoryResponse> {
    const id=magicIdentity(asset);
    if (!id) return {available:true,status:'needs_details',message:'Add the Magic set code, collector number, and finish in Edit to match the exact printing.',series:[]};
    const saved=await MagicHistory.findById(id.key).lean();
    if (!saved?.series.length) return {available:true,status:'not_loaded',message:'Historical prices for this printing have not been loaded yet.',series:[]};
    const graded=asset.details.grader && asset.details.grader!=='ungraded';
    return {available:true,status:'ready',message:graded?'Ungraded market history is shown as a reference; it does not value your graded copy.':'Price history for this printing and finish.',series:saved.series};
}
