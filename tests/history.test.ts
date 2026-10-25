import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import type {AssetRecord} from '../shared/schemas.ts';
import {historyKind,historyVersion,normalizeHistory} from '../shared/history.ts';
import {goldHistorySeries,metalHistoryDetails,metalHistory,reserveGoldRequest} from '../server/history/gold.ts';
import {magicIdentity,magicSeries,magicHistory} from '../server/history/magic.ts';
import {selectPriceObjects} from '../server/history/stream.ts';
import {HistoryBudget,HistoryCache,MagicHistory,ResearchSnapshot} from '../server/history/models.ts';
import {assetMarketHistory} from '../server/history/service.ts';
import {Asset} from '../server/db/models.ts';
import {historyRouter} from '../server/routes/history.ts';
import {errorHandler} from '../server/errors.ts';

const asset:AssetRecord={id:'0123456789abcdef01234567',name:'Gold ring',category:'jewelry',brand:null,model:null,condition:'good',currency:'USD',location:null,purchaseDate:null,purchasePriceCents:null,serialNumber:null,notes:null,details:{metal:'gold',weightGrams:31.1034768,purity:'18k'},isSample:false,createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-01-01T00:00:00Z'};
const card:AssetRecord={...asset,category:'collectible',name:'Lightning Bolt',details:{kind:'trading_card',game:'magic',setCode:'lea',cardNumber:'001/300',finish:'foil'}};
const uuid='01234567-1234-1234-1234-0123456789ab';
const other='11234567-1234-1234-1234-0123456789ab';
const date=new Date('2026-01-03T12:00:00Z');
const points=[{day:'2026-01-01',avg_price:2000},{day:'2026-01-02',avg_price:2100}];

test('history keeps actual valid observations, zero and integer cents without backfilling',()=>{
    assert.deepEqual(normalizeHistory([{date:'2025-01-03',value:12.345},{date:'2025-01-01',value:0},{date:'2025-01-03',value:12.34},{date:'2025-02-30',value:9},{date:'2027-01-01',value:10},{date:'2025-01-02',value:-1},{date:'2025-01-02',value:'12'},{date:'2025-01-02',value:Infinity},{date:'2025-01-04',value:Number.MAX_VALUE}], '2026-01-01'),[{date:'2025-01-01',valueCents:0},{date:'2025-01-03',valueCents:1234}]);
});

test('history sources require the correct category, exact printing, and explicit finish',()=>{
    assert.equal(historyKind(asset),'metal');assert.equal(historyKind(card),'magic');
    assert.equal(historyKind({...card,details:{...card.details,game:'pokemon'}}),null);
    assert.deepEqual(magicIdentity(card),{set:'LEA',number:'1',finish:'foil',key:'LEA:1:foil'});
    for(const details of [{...card.details,finish:null},{...card.details,setCode:''},{...card.details,cardNumber:''},{...card.details,setCode:'../secret'}]) assert.equal(magicIdentity({...card,details}),null);
    assert.notEqual(historyVersion(card),historyVersion({...card,details:{...card.details,finish:'normal'}}));
});

test('gold history reads the daily provider response and scales only the metal content',()=>{
    const series=goldHistorySeries([...points,null,{day:'2026-01-04',avg_price:9999}],'XAU',date);
    assert.equal(series.points.length,2);assert.equal(series.points[0].valueCents,200000);
    assert.deepEqual(metalHistoryDetails(asset),{symbol:'XAU',fineOunces:0.75});
    assert.equal(metalHistoryDetails({...asset,details:{...asset.details,weightGrams:0}}),null);
    assert.throws(()=>goldHistorySeries({error:'bad'},'XAU',date));
});

test('metal history never calls a provider on GET, reuses the shared cache, and preserves saved prices on failures',async t=>{
    const oldKey=process.env.GOLD_API_KEY;process.env.GOLD_API_KEY='test-key';
    let cached:any=null,requests=0;
    t.mock.method(HistoryCache,'findById',()=>({lean:async()=>cached}));
    t.mock.method(HistoryCache,'findOneAndUpdate',async(_q:any,update:any)=>{cached={...update.$set};return cached;});
    t.mock.method(HistoryBudget,'findOneAndUpdate',async()=>({_id:'test'}));
    t.mock.method(HistoryBudget,'updateOne',async()=>({}));
    t.mock.method(globalThis,'fetch',async(url:unknown,init?:RequestInit)=>{
        requests++;const u=new URL(String(url));
        assert.equal(u.origin,'https://api.gold-api.com');assert.equal(u.pathname,'/history');
        assert.equal(u.searchParams.get('groupBy'),'day');assert.equal(u.searchParams.get('aggregation'),'avg');
        assert.equal(u.searchParams.get('symbol'),'XAU');assert.ok(Number(u.searchParams.get('endTimestamp'))<10**11,'UNIX seconds, not milliseconds');
        assert.equal((init?.headers as Record<string,string> | undefined)?.['x-api-key'],'test-key');
        assert.equal(u.searchParams.has('api_key'),false);
        return new Response(JSON.stringify(points));
    });
    try {
        assert.equal((await metalHistory(asset,false)).status,'not_loaded');assert.equal(requests,0);
        const loaded=await metalHistory(asset,true);assert.equal(requests,1);assert.equal(loaded.series[0].points[0].valueCents,150000);
        assert.match(loaded.series[0].note,/Not the resale/);
        await metalHistory({...asset,details:{...asset.details,weightGrams:62.2069536}},true);assert.equal(requests,1,'another item uses the same metal cache');
        delete process.env.GOLD_API_KEY;assert.equal((await metalHistory(asset,false)).status,'ready');
        cached.expiresAt=new Date(0);process.env.GOLD_API_KEY='test-key';
        t.mock.method(globalThis,'fetch',async()=>{throw new Error('secret upstream body');});
        await assert.rejects(metalHistory(asset,true),/did not respond/);
        assert.equal((await metalHistory(asset,false)).series[0].points.length,2);
        cached=null;delete process.env.GOLD_API_KEY;
        assert.equal((await metalHistory(asset,true)).status,'needs_key');
    } finally {if(oldKey===undefined)delete process.env.GOLD_API_KEY;else process.env.GOLD_API_KEY=oldKey;}
});

test('the shared free quota uses an atomic rolling hour and fails closed at ten requests',async t=>{
    let accepted=0;
    t.mock.method(HistoryBudget,'updateOne',async()=>({}));
    t.mock.method(HistoryBudget,'findOneAndUpdate',async(query:any,update:any,options:any)=>{
        assert.doesNotMatch(query._id,/private-test-key/);assert.equal(query.$expr.$lt[1],10);
        assert.equal(options.updatePipeline,true);assert.equal(options.upsert,undefined);
        assert.equal(query.$expr.$lt[0].$size.$filter.cond.$gt[1].getTime(),date.getTime()-3600000);
        assert.equal(update[0].$set.requests.$concatArrays[1][0],date);
        if(accepted>=10)return null;
        accepted++;return {_id:query._id};
    });
    for(let i=0;i<10;i++)await reserveGoldRequest('private-test-key',date);
    await assert.rejects(reserveGoldRequest('private-test-key',date),(e:any)=>e.status===429&&e.code==='history_quota');
    assert.equal(accepted,10);
    t.mock.method(HistoryBudget,'findOneAndUpdate',async()=>{throw new Error('db unavailable');});
    await assert.rejects(reserveGoldRequest('private-test-key',date),/db unavailable/);
});

test('Magic retail history separates finishes and providers, excludes buylist/EUR and keeps exact dates',async t=>{
    const raw={paper:{tcgplayer:{currency:'USD',retail:{normal:{'2026-01-01':1},foil:{'2026-01-01':2,'2026-01-02':0}},buylist:{foil:{'2026-01-01':0.2}}},cardkingdom:{currency:'EUR',retail:{foil:{'2026-01-01':8}}}}};
    const series=magicSeries(raw,uuid,'foil',date);
    assert.equal(series.length,1);assert.deepEqual(series[0].points,[{date:'2026-01-01',valueCents:200},{date:'2026-01-02',valueCents:0}]);assert.match(series[0].label,/Foil/);
    t.mock.method(MagicHistory,'findById',(key:string)=>{assert.equal(key,'LEA:1:foil');return {lean:async()=>({series})};});
    const response=await magicHistory({...card,details:{...card.details,grader:'PSA',grade:'10'}});
    assert.match(response.message,/does not value your graded copy/);
    assert.equal((await magicHistory({...card,details:{}})).status,'needs_details');
});

test('bulk history streaming handles every chunk boundary and escaped strings without retaining unrelated entries',async()=>{
    const target={paper:{tcgplayer:{currency:'USD',retail:{foil:{'2026-01-01':2}}}},note:'Pokémon {brace} \\"quoted"'};
    const raw=JSON.stringify({meta:{date:'2026-01-02'},data:{[other]:{note:'irrelevant'.repeat(1000)},[uuid]:target}});
    for(const size of [1,3,37,64,4096]) {
        const encoded=new TextEncoder().encode(raw);
        async function* chunks(){for(let i=0;i<encoded.length;i+=size)yield encoded.subarray(i,i+size);}
        const selected=[];for await(const entry of selectPriceObjects(chunks(),new Set([uuid])))selected.push(entry);
        assert.deepEqual(selected,[{uuid,value:target}],`chunk size ${size}`);
    }
    async function* incomplete(){yield `{"data":{"${uuid}":{"paper":`;}
    await assert.rejects(async()=>{for await(const _ of selectPriceObjects(incomplete(),new Set([uuid]))){}},/middle of an entry/);
    async function* empty(){yield assert.fail('should not consume');}
    for await(const _ of selectPriceObjects(empty(),new Set()))assert.fail('no results');
});

test('asking-price series always reads only the owner, asset and matching version',async t=>{
    const simple={...asset,category:'electronics' as const,details:{}};
    t.mock.method(ResearchSnapshot,'find',(query:any)=>{
        assert.deepEqual(query,{ownerId:'owner-a',assetId:asset.id,version:historyVersion(simple)});
        return {sort:(sort:any)=>{assert.deepEqual(sort,{date:-1});return {limit:(limit:number)=>{assert.equal(limit,366);return {lean:async()=>[{date:'2026-01-02',valueCents:200,fetchedAt:date.toISOString()},{date:'2026-01-01',valueCents:100,fetchedAt:date.toISOString()}]};}};}};
    });
    const result=await assetMarketHistory(simple,'owner-a');
    assert.equal(result.series[0].basis,'asking');assert.match(result.series[0].note,/not completed sales/);
    assert.deepEqual(result.series[0].points.map(p=>p.date),['2026-01-01','2026-01-02']);
});

test('history routes reject a different owner and invalid IDs before accessing private history or providers',async t=>{
    const state=mongoose.connection.readyState;mongoose.connection.readyState=1;
    t.mock.method(Asset,'findOne',(query:any)=>{
        assert.equal(query._id,asset.id);
        return {lean:async()=>query.ownerId==='owner-a'?{...asset,_id:new mongoose.Types.ObjectId(asset.id),createdAt:new Date(asset.createdAt),updatedAt:new Date(asset.updatedAt),category:'electronics',details:{}}:null};
    });
    let reads=0;
    t.mock.method(ResearchSnapshot,'find',(query:any)=>{reads++;assert.equal(query.ownerId,'owner-a');return {sort:()=>({limit:()=>({lean:async()=>[]})})};});
    t.mock.method(globalThis,'fetch',()=>{throw new Error('unexpected external request');});
    const app=express();app.use((_req,res,next)=>{res.locals.userId=_req.header('x-test-owner')??'owner-b';next();});app.use(historyRouter);app.use(errorHandler);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const address=server.address() as {port:number};
    const {request}=await import('node:http');
    const call=(id:string,owner:string,method='GET')=>new Promise<number>((resolve,reject)=>{const req=request(`http://127.0.0.1:${address.port}/assets/${id}/history`,{method,headers:{'x-test-owner':owner}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});req.on('error',reject);req.end();});
    try {
        assert.equal(await call(asset.id,'owner-b'),404);assert.equal(reads,0);
        assert.equal(await call(asset.id,'owner-b','POST'),404);assert.equal(reads,0);
        assert.equal(await call('invalid','owner-a'),404);assert.equal(reads,0);
        assert.equal(await call(asset.id,'owner-a'),200);assert.equal(reads,1);
    } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));mongoose.connection.readyState=state;}
});

test('the separate Magic import streams a local compressed dataset and saves only the tracked printing',async t=>{
    const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
    const {tmpdir}=await import('node:os');const {join}=await import('node:path');
    const {gzipSync}=await import('node:zlib');
    const folder=await mkdtemp(join(tmpdir(),'gauge-mtg-test-'));
    const argv=process.argv,state=mongoose.connection.readyState;
    const saved:{key:string;series:any[]}[]=[];
    try {
        await writeFile(join(folder,'LEA.json'),JSON.stringify({data:{cards:[{uuid,number:'1',finishes:['foil','normal']}]}}));
        await writeFile(join(folder,'AllPrices.json.gz'),gzipSync(JSON.stringify({data:{[other]:{paper:{}},[uuid]:{paper:{tcgplayer:{currency:'USD',retail:{foil:{'2026-01-01':2,'2026-01-02':3}}}}}}})));
        process.argv=['node','sync-mtg-history.ts',join(folder,'AllPrices.json.gz'),folder];
        mongoose.connection.readyState=1;
        t.mock.method(process,'loadEnvFile',()=>undefined);
        t.mock.method(mongoose,'disconnect',async()=>undefined);
        t.mock.method(console,'log',()=>undefined);
        t.mock.method(globalThis,'fetch',()=>{throw new Error('local files must not call a provider');});
        t.mock.method(Asset,'find',()=>({lean:async()=>[{...card,_id:new mongoose.Types.ObjectId(card.id),createdAt:new Date(card.createdAt),updatedAt:new Date(card.updatedAt)}]}));
        t.mock.method(MagicHistory,'findOneAndUpdate',async(query:any,update:any)=>{saved.push({key:query._id,series:update.$set.series});return {};});
        await import('../scripts/sync-mtg-history.ts');
        assert.equal(saved.length,1);assert.equal(saved[0].key,'LEA:1:foil');
        assert.deepEqual(saved[0].series[0].points,[{date:'2026-01-01',valueCents:200},{date:'2026-01-02',valueCents:300}]);
    } finally {process.argv=argv;mongoose.connection.readyState=state;await rm(folder,{recursive:true,force:true});}
});
