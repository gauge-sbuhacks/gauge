import fs from 'node:fs';
import {Readable} from 'node:stream';
import {createGunzip} from 'node:zlib';
import mongoose from 'mongoose';
import {magicIdentity,magicSeries} from '../server/history/magic.js';
import {MagicHistory} from '../server/history/models.js';
import {selectPriceObjects} from '../server/history/stream.js';
import {historyKind} from '../shared/history.js';

for(const file of ['.env.local','.env']) if(fs.existsSync(file)) process.loadEnvFile(file);
const {connectDb}=await import('../server/db/connect.js');
const {Asset,toAssetRecord}=await import('../server/db/models.js');

async function publicJson(url:string) {
    const res=await fetch(url,{headers:{accept:'application/json','user-agent':'Gauge/0.2 (historical card prices)'},signal:AbortSignal.timeout(20000)});
    if(!res.ok) throw new Error(`Public set data unavailable (${res.status}). Try again later.`);
    return res.json();
}

try {
    await connectDb();
    const assets=await Asset.find({category:'collectible','details.kind':'trading_card'}).lean();
    const tracked=assets.map(a=>toAssetRecord(a)).filter(a=>historyKind(a)==='magic').map(a=>({asset:a,identity:magicIdentity(a)})).filter(v=>v.identity!==null);
    if(!tracked.length) {
        console.log('No Magic cards with a set code and collector number are tracked yet. Add them in Edit, then run this command again.');
    } else {
        const wanted=new Map<string,{key:string;finish:string}[]>();
        for(const set of new Set(tracked.map(t=>t.identity!.set))) {
            const setFile=process.argv[3] && `${process.argv[3]}/${set}.json`;
            const raw=(setFile ? JSON.parse(await fs.promises.readFile(setFile,'utf8')) : await publicJson(`https://mtgjson.com/api/v5/${set}.json`)) as {data?:{cards?:{uuid?:string;number?:string;side?:string;finishes?:string[]}[]}};
            for(const track of tracked.filter(t=>t.identity!.set===set)) {
                const id=track.identity!;
                const cards=(raw.data?.cards??[]).filter(c=>String(c.number).replace(/^0+(?=\d)/,'')===id.number&&c.side!=='b'&&c.uuid&&(!c.finishes||c.finishes.includes(id.finish)));
                if(cards.length!==1) {console.log(`Skipped ${id.key}: could not identify one exact printing and finish.`);continue;}
                const uuid=cards[0].uuid!.toLowerCase();
                const list=wanted.get(uuid)??[];list.push({key:id.key,finish:id.finish});wanted.set(uuid,list);
            }
        }
        if(wanted.size) {
            const file=process.argv[2];
            let stream:Readable;
            if(file) stream=fs.createReadStream(file);
            else {
                console.log('Downloading the free MTGJSON price-history file. This is a large one-time import; no API key or paid service is used.');
                const res=await fetch('https://mtgjson.com/api/v5/AllPrices.json.gz',{headers:{'user-agent':'Gauge/0.2 (historical card prices)'},signal:AbortSignal.timeout(600000)});
                if(!res.ok||!res.body) throw new Error(`Free MTGJSON download unavailable (${res.status}). Download AllPrices.json.gz from https://mtgjson.com/downloads/all-files/ and pass its local path to this command.`);
                stream=Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
            }
            const decompressed=!file||file.endsWith('.gz')?stream.pipe(createGunzip()):stream;
            if(decompressed!==stream) stream.on('error',err=>decompressed.destroy(err));
            let imported=0;
            try {
                for await(const entry of selectPriceObjects(decompressed,new Set(wanted.keys()))) {
                    for(const target of wanted.get(entry.uuid)??[]) {
                        const series=magicSeries(entry.value,entry.uuid,target.finish);
                        if(!series.length) continue;
                        await MagicHistory.findOneAndUpdate({_id:target.key},{$set:{series,importedAt:new Date()}},{upsert:true,runValidators:true});
                        imported++;console.log(`Imported ${target.key}: ${series[0].points.length} dated prices.`);
                    }
                }
            } finally {stream.destroy();decompressed.destroy();}
            console.log(`Finished. ${imported} exact printing/finish histories loaded. Existing assets and valuations were not changed.`);
        }
    }
} catch(err) {
    console.error(err instanceof Error?err.message:'The import failed.');process.exitCode=1;
} finally {await mongoose.disconnect();}
