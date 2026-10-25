import { test } from 'node:test';
import { localDateIso } from '../src/lib/format.ts';
import assert from 'node:assert/strict';
import { comparableAskingRange, listingDraft, marketLocationSchema, marketQuery, matchListing, sellingPlatforms, type ComparableListing } from '../shared/marketplace.ts';
import { assetCreateSchema, profileInputSchema, valuationCreateSchema, VALUE_TYPES, type AssetRecord, type PortfolioResponse } from '../shared/schemas.ts';
import { buildPortfolio } from '../src/lib/portfolio.ts';
import { liquiditySummary } from '../src/lib/liquidity.ts';
import { buildSamplePortfolio } from '../shared/sampleData.ts';
import { researchAsset } from '../server/marketplace/research.ts';
import { toProfileRecord, type ProfileDoc } from '../server/db/models.ts';

const asset: AssetRecord={ id:'0123456789abcdef01234567', name:'Apple iPhone 15 Pro', category:'electronics', brand:'Apple', model:'iPhone 15 Pro', condition:'good', currency:'USD', location:'Home', purchaseDate:'2024-01-01', purchasePriceCents:100000, serialNumber:'PRIVATE-SERIAL', notes:'Private note', details:{ specs:'256GB', addressLine1:'Private address' }, isSample:false, createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z' };
const location={ city:'New York',region:'NY',postalCode:'10001',country:'US' };
const listing=(priceCents:number):ComparableListing => ({ id:String(priceCents),title:'Apple iPhone 15 Pro',priceCents,currency:'USD',url:'https://www.ebay.com/itm/1',imageUrl:null,condition:'Used',location:'US',platform:'ebay',matchScore:.9,matchReasons:['Model matched'],shippingCents:null });

test('location validates US ZIP codes, normalizes country, and supports other postal formats',() => {
    assert.equal(marketLocationSchema.parse({...location,country:'us'}).country,'US');
    assert.equal(marketLocationSchema.safeParse({...location,postalCode:'bad'}).success,false);
    assert.equal(marketLocationSchema.safeParse({...location,country:'Canada'}).success,false);
    assert.equal(marketLocationSchema.safeParse({...location,country:'CA',postalCode:'M5V 2T6'}).success,true);
    assert.equal(profileInputSchema.parse({ name:'Bryce',purpose:'selling' }).marketLocation,undefined);
});
test('matches an item and rejects different models, brands, accessories, parts and condition mismatches',() => {
    assert.ok(matchListing(asset,'Apple iPhone 15 Pro 256GB Unlocked','Used'));
    for (const title of ['Apple iPhone 14 Pro','Samsung iPhone 15 Pro','Case for Apple iPhone 15 Pro','Apple iPhone 15 Pro charger','Apple iPhone 15 Pro for parts','Apple iPhone 15 Pro bundle','Apple iPhone 15 Pro Max 256GB','Apple iPhone 15 Pro 128GB']) assert.equal(matchListing(asset,title,'Used'),null,title);
    assert.equal(matchListing(asset,'Apple iPhone 15 Pro','New'),null);
    assert.equal(matchListing({...asset,condition:'new'},'Apple iPhone 15 Pro','Used'),null);
});
test('requires the correct watch reference, card edition and grade',() => {
    const watch={...asset,category:'watch' as const,brand:'Rolex',model:'Submariner',details:{referenceNumber:'126610LN'}};
    assert.ok(matchListing(watch,'Rolex Submariner 126610LN','Pre-owned'));
    assert.equal(matchListing(watch,'Rolex Submariner 116610LN','Pre-owned'),null);
    const card={...asset,category:'collectible' as const,brand:null,model:'Charizard',details:{setName:'Base Set',cardNumber:'4',grader:'PSA',grade:'10'}};
    assert.ok(matchListing(card,'Charizard Base Set 4 PSA 10','Used'));
    assert.equal(matchListing(card,'Charizard Base Set 4 PSA 9','Used'),null);
});
test('asking ranges need three relevant prices, exclude outliers, and preserve zero/missing distinctions',() => {
    assert.equal(comparableAskingRange([listing(10000),listing(11000)]),null);
    const range=comparableAskingRange([10000,11000,12000,13000,1000000].map(listing));
    assert.equal(range?.count,4);assert.equal(range?.medianCents,11500);
    assert.equal(comparableAskingRange([listing(0),listing(100),listing(200)]),null);
});
test('platform choices follow category and include location in supported searches',() => {
    assert.equal(sellingPlatforms({...asset,category:'property'},location)[0].id,'zillow');
    assert.equal(sellingPlatforms({...asset,category:'vehicle'},location)[0].id,'cars');
    assert.equal(sellingPlatforms({...asset,category:'household'},location)[0].id,'facebook');
    const platforms=sellingPlatforms(asset,location);
    assert.equal(platforms[0].id,'ebay');
    assert.equal(new URL(platforms[0].searchUrl).searchParams.get('_stpos'),'10001');
    assert.match(new URL(platforms[1].searchUrl).searchParams.get('query')! ,/New York/);
    for (const p of platforms) {assert.equal(new URL(p.searchUrl).protocol,'https:');assert.equal(new URL(p.sellUrl).protocol,'https:');}
});
test('listing drafts omit private notes, serials and addresses and include a reviewable price',() => {
    const draft=listingDraft(asset,50000);
    assert.match(draft,/500.00/);assert.doesNotMatch(draft,/PRIVATE-SERIAL|Private note|Private address/);
    assert.doesNotMatch(marketQuery(asset),/PRIVATE-SERIAL|Private address/);
});
test('obsolete value types cannot be recorded or affect an existing portfolio',() => {
    assert.deepEqual(VALUE_TYPES,['fair_market','liquidation','cost_basis']);
    const legacy={ id:'old',assetId:asset.id,valueType:'replacement',amountCents:900000,currency:'USD',observedAt:'2025-01-01',createdAt:asset.createdAt };
    const portfolio=buildPortfolio({assets:[asset],valuations:[legacy]} as unknown as PortfolioResponse);
    assert.equal(portfolio[0].valuations.length,0);
    assert.equal(valuationCreateSchema.safeParse({ valueType:'replacement',amountCents:100,observedAt:'2026-01-01' }).success,false);
    const clean=assetCreateSchema.parse({...asset,insurance:'insured'});
    assert.equal('insurance' in clean,false);
    assert.equal(buildSamplePortfolio().flatMap(i => i.valuations).some(v => (v.valueType as string)==='replacement'),false);
});
test('older onboarding profiles remain readable after purpose removal',() => {
    const old={name:'Bryce',purpose:'insurance',onboardedAt:new Date('2025-01-01')} as unknown as ProfileDoc;
    assert.equal(toProfileRecord(old).purpose,'exploring');assert.equal(toProfileRecord(old).marketLocation,null);
});
test('liquidity compares the same assets rather than subtracting mismatched totals',() => {
    const values=[{id:'fm',assetId:asset.id,valueType:'fair_market',amountCents:60000,lowCents:null,highCents:null,currency:'USD',observedAt:'2026-10-01',source:'user',createdAt:asset.createdAt},{id:'qs',assetId:asset.id,valueType:'liquidation',amountCents:45000,lowCents:null,highCents:null,currency:'USD',observedAt:'2026-10-01',source:'user',createdAt:asset.createdAt}];
    const items=buildPortfolio({ assets:[asset,{...asset,id:'missing',purchasePriceCents:null}],valuations:values } as PortfolioResponse);
    const sum=liquiditySummary(items);assert.equal(sum.pairs.length,1);assert.equal(sum.gapCents,15000);assert.equal(sum.marketCents,60000);assert.equal(sum.quickCents,45000);
});
test('missing provider credentials produce honest empty evidence and useful links',async () => {
    const oldId=process.env.EBAY_CLIENT_ID,oldSecret=process.env.EBAY_CLIENT_SECRET;
    delete process.env.EBAY_CLIENT_ID;delete process.env.EBAY_CLIENT_SECRET;
    try {const report=await researchAsset(asset,location);assert.equal(report.providerStatus,'needs_connection');assert.equal(report.askingRange,null);assert.deepEqual(report.listings,[]);assert.equal(report.platforms.length,2);}
    finally {if(oldId!==undefined)process.env.EBAY_CLIENT_ID=oldId;if(oldSecret!==undefined)process.env.EBAY_CLIENT_SECRET=oldSecret;}
});
test('provider research normalizes real response shapes, removes unsuitable matches, and reports provider outages',async () => {
    const original=globalThis.fetch,oldId=process.env.EBAY_CLIENT_ID,oldSecret=process.env.EBAY_CLIENT_SECRET;
    process.env.EBAY_CLIENT_ID='test-id';process.env.EBAY_CLIENT_SECRET='test-secret';
    let calls=0;
    globalThis.fetch=(async (_url:unknown,init?:RequestInit) => {
        calls++;
        if(calls===1)return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}));
        assert.match(String(((init?.headers ?? {}) as Record<string,string>)['X-EBAY-C-ENDUSERCTX']),/10001/);
        return new Response(JSON.stringify({itemSummaries:[...['500','550','600'].map((price,i)=>({itemId:String(i),title:'Apple iPhone 15 Pro 256GB',price:{value:price,currency:'USD'},condition:'Used',itemWebUrl:`https://www.ebay.com/itm/${i}`})),{itemId:'bad',title:'Case for Apple iPhone 15 Pro',price:{value:'5',currency:'USD'},itemWebUrl:'https://www.ebay.com/itm/99'}]}));
    }) as typeof fetch;
    try {const report=await researchAsset(asset,location);assert.equal(report.providerStatus,'ready');assert.equal(report.listings.length,3);assert.equal(report.askingRange?.medianCents,55000);
        globalThis.fetch=(async()=>new Response('{}',{status:503})) as typeof fetch;
        const unavailable=await researchAsset(asset,location);assert.equal(unavailable.providerStatus,'unavailable');assert.equal(unavailable.askingRange,null);
    } finally {globalThis.fetch=original;if(oldId===undefined)delete process.env.EBAY_CLIENT_ID;else process.env.EBAY_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.EBAY_CLIENT_SECRET;else process.env.EBAY_CLIENT_SECRET=oldSecret;}
});
test('unsupported asset and country combinations never invent pricing',async () => {
    const home=await researchAsset({...asset,category:'property'},location);assert.equal(home.providerStatus,'unsupported');assert.equal(home.askingRange,null);
    const overseas=await researchAsset(asset,{...location,country:'CA'});assert.equal(overseas.providerStatus,'unsupported');assert.deepEqual(overseas.listings,[]);
});

test('research observation dates use the viewer’s calendar day rather than UTC slicing', () => {
    const d = new Date(2026, 9, 24, 21, 30);
    assert.equal(localDateIso(d), '2026-10-24');
});
