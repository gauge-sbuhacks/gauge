import {historyKind,historyVersion,type HistoryResponse} from '../../shared/history.js';
import type {AssetRecord} from '../../shared/schemas.js';
import {metalHistory} from './gold.js';
import {magicHistory} from './magic.js';
import {ResearchSnapshot} from './models.js';

export async function assetMarketHistory(asset:AssetRecord,ownerId:string,refresh=false):Promise<HistoryResponse> {
    const kind=historyKind(asset);
    let response:HistoryResponse={available:false,status:'unsupported',message:'Your recorded values build this item’s history over time.',series:[]};
    if(kind==='metal') response=await metalHistory(asset,refresh);
    if(kind==='magic') response=await magicHistory(asset);
    const snapshots=await ResearchSnapshot.find({ownerId,assetId:asset.id,version:historyVersion(asset)}).sort({date:-1}).limit(366).lean();
    snapshots.reverse();
    if(snapshots.length) {
        response={...response,available:true,message:kind?response.message:'Active listing prices saved during your research.',status:response.series.length?'ready':kind?response.status:'ready',series:[...response.series,{
            id:'research-snapshots',label:'Researched asking prices',basis:'asking',currency:'USD',
            points:snapshots.map(s=>({date:s.date,valueCents:s.valueCents})),source:'Gauge research · eBay',sourceUrl:'https://www.ebay.com',fetchedAt:snapshots.at(-1)!.fetchedAt,
            note:'Daily middle asking prices saved when you researched this item. These are observed listings, not completed sales.'
        }]};
    }
    return response;
}
