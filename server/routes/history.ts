import {Router} from 'express';
import {Asset,toAssetRecord,type AssetDoc,type WithId} from '../db/models.js';
import {withDb} from '../db/connect.js';
import {ownerIdOf} from '../auth.js';
import {notFound,HttpError} from '../errors.js';
import {makeRateLimiter} from '../lookups/cache.js';
import {assetMarketHistory} from '../history/service.js';

export const historyRouter=Router();
historyRouter.use(withDb);
const allow=makeRateLimiter(5,60000);
for(const method of ['get','post'] as const) historyRouter[method]('/assets/:id/history',async(req,res)=>{
    const ownerId=ownerIdOf(res);
    if(!/^[a-f0-9]{24}$/i.test(req.params.id)) throw notFound('That asset');
    if(method==='post'&&!allow(ownerId)) throw new HttpError(429,'rate_limited','Wait a minute before loading history again.');
    const asset=await Asset.findOne({_id:req.params.id,ownerId}).lean<WithId<AssetDoc>>();
    if(!asset) throw notFound('That asset');
    res.json(await assetMarketHistory(toAssetRecord(asset),ownerId,method==='post'));
});
