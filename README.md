# Gauge

Understand the value of what you own and prepare to sell it. Gauge combines a physical-asset portfolio, location-aware marketplace searches, comparable asking-price research, and practical selling tools. Track purchase cost, fair market estimates, and quick-sale estimates, with value history and inventory exports.

You can type an asset in, or add one from a photo: **Add an asset** offers a manual form or a QR code. The phone opens that code with no extra sign-in, and the picture comes back to the same session.

## to run it

You need **Node 22 or newer**.

```bash
npm install
npm run dev
```

That starts two things together:

- the site on http://localhost:5180 (vite)
- the api on http://localhost:3180 (express). vite forwards every `/api` request to it

Open the site, go to **Setup → Developer setup & test data** to load the sample portfolio (2020 Cadillac XT6, 89 Carnation Road, and 8 more), and click around. The **Setup** page in the app shows what's connected and what still needs a key.

With no `.env.local` at all, the app uses MongoDB on your own computer (`mongodb://127.0.0.1:27017/gauge`) and signs you in as the "local dev user". Once the team has the shared keys (below), you don't need MongoDB installed.

Other scripts:

- `npm run build` type-checks everything, then builds the site into `dist/`
- `npm run typecheck` only the type check
- `npm run lint` oxlint
- `npm test` pricing, history, and ownership checks
- `npm run sync:mtg-history` imports free historical prices for tracked Magic printings

## keys

Copy `.env.example` to `.env.local`, fill in what you have, and restart `npm run dev`. **Never commit `.env.local`** (git already ignores it). Teammates get the values from Ashton privately (a DM or password manager), not through GitHub.

| name | what it's for |
| --- | --- |
| `MONGODB_URI` | the Atlas database. Locally it falls back to MongoDB on your own computer |
| `VITE_CLERK_PUBLISHABLE_KEY` | turns on the Clerk sign-in screen (browser side) |
| `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | lets the api check who's calling. Set all three Clerk keys together |
| `RENTCAST_API_KEY` | home value estimates on real estate assets (free plan: 50 a month) |
| `GOLD_API_KEY` | historical daily metal benchmarks; free plan, 10 history/OHLC requests per hour |
| `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | comparable active listings; no historical sold-price access |
| `VINAUDIT_API_KEY` | retail and trade-in values on vehicles (trial: 100 queries, 2 per lookup) |
| `GAUGE_ALLOW_DEV_AUTH` | `true` skips sign-in on a Vercel deploy. Everyone shares one account, so test data only |

Only `VITE_` variables reach the browser. Everything else stays on the api side.

### MongoDB Atlas (the database)

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a free **M0** cluster (AWS, `us-east-1` is closest to Vercel's default region)
3. Create a database user. Let Atlas generate the password (letters and numbers only, so it works in a URL) and save it
4. **Network Access**: add `0.0.0.0/0` (allow from anywhere). Vercel and teammates don't have fixed IPs; the username and password still protect it
5. **Connect, Drivers**: copy the `mongodb+srv://...` string, put the password in, and add a database name before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/gauge-dev?retryWrites=true&w=majority`
6. Use `gauge-dev` in `.env.local` (shared by the team while building) and `gauge` on Vercel (the live site). Same cluster, two separate databases

### Clerk (sign-in)

1. Sign up at https://clerk.com and create an application called Gauge. Pick the sign-in options (email and Google are a good start)
2. Copy the **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`) from the API keys page
3. Set `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` to the pk key, and `CLERK_SECRET_KEY` to the sk key

4. **Configure, SSO connections**: turn on Google, GitHub, and Apple. The free plan allows 3 social connections. The sign-in and sign-up pages show whatever is switched on here, so there's no code change when you swap one

The `test` keys are fine for the hackathon, locally and on the vercel.app URL. With Clerk on, each teammate signs up in the app with their own email and gets their own portfolio, even on the shared database.

With Clerk on, signed-out visitors see the landing page at `/`, sign in at `/sign-in` or `/sign-up`, and answer three onboarding questions (`/onboarding`) the first time. Without Clerk keys, the local dev user goes straight to onboarding, and the landing page is still at `/home`. To see onboarding again locally, delete your profile: `mongosh gauge --eval 'db.profiles.deleteMany({})'`.

### RentCast (home values, optional)

1. Go to the API dashboard at https://app.rentcast.io/app/api and sign in (this creates the account)
2. **Select Plan** and pick the free one (50 requests a month; it may ask for a card because extra requests are billed)
3. **Create API Key** and set `RENTCAST_API_KEY`
4. On a real estate asset, open **Lookups, Get an estimate**. Each lookup uses one request; the same address is cached for a day

### VinAudit (vehicle market values, optional)

1. Request a trial at https://data.vinaudit.com/pricing (up to 100 queries). Make sure the key has **Market Values** enabled; the demo key does not
2. Set `VINAUDIT_API_KEY`
3. On a vehicle with the full 17-character VIN, open **Lookups, Market value**. It sends the mileage, condition (mapped to like new, average, or not great), and a salvage or rebuilt title, and returns retail and trade-in values. Each lookup uses 2 queries; the same car is cached for a day

The **Depreciation** card on vehicles needs no key. It uses the purchase price and date, the latest fair market value, and the mileage now and when bought. The five-year projection extends the car's own yearly rate (or a rule of thumb when its history is under a year) and is labeled as a projection.

### Card prices and metal values (free, no keys)

- **Trading cards**: on a collectible with type Trading card, **Lookups, Card prices** searches by name, set, and number. Pokémon comes from TCGdex (the Pokémon TCG API was failing when we tested it), Magic from Scryfall. Both return TCGplayer market prices for ungraded copies
- **Gold, silver, platinum, palladium**: on a Jewelry & metals asset with the metal, total weight, and purity filled in, **Lookups, Melt value** multiplies the live spot price from gold-api.com by the weight and purity

## deploying (vercel)

One Vercel project, same idea as GradientV: the vite site is static, and `api/index.ts` runs the express app as a function. `vercel.json` sends `/api/*` to that function and everything else to `index.html`.

1. Push to GitHub, then **Add New Project** in Vercel and import the repo (the framework is set in `vercel.json`)
2. Before the first deploy, add the environment variables: `MONGODB_URI` (with `/gauge`), and the three Clerk keys
3. Deploy. After that, every push to `main` redeploys automatically

Without Clerk keys the deployed api refuses requests on purpose (unless `GAUGE_ALLOW_DEV_AUTH=true`), so a public URL never exposes a shared account.

**Vercel free (Hobby) plan and teammates:** Hobby only supports teammates' pushes deploying on **public** repos. On a private repo, only the Vercel account owner's commits deploy. Hobby is also for non-commercial use, which a hackathon is.

## working as a team

1. Ashton owns the GitHub repo and adds everyone as collaborators (repo Settings, Collaborators)
2. Each person: install Node 22+, `git clone`, `npm install`, get `.env.local` from Ashton, `npm run dev`
3. Work on a branch per feature, never directly on `main`:
   ```bash
   git checkout -b dashboard-tweaks
   git add .
   git commit -m "what you changed"
   git push -u origin dashboard-tweaks
   ```
4. Open a pull request on GitHub. Someone else looks at it, then merge into `main`. Vercel redeploys the live site from `main`
5. Before starting new work: `git checkout main` then `git pull`, then make a new branch
6. Split work by area (one person on lookups, one on the dashboard, and so on) so two people aren't editing the same file
7. If you change `package.json` (add a library), say so in the PR. Everyone else runs `npm install` after pulling. Use `npm install`, not `npm update`, so everyone keeps the same versions from `package-lock.json`

## where things live

```
shared/         used by both the site and the api
  categories.ts   every category and its fields (add a field here and the form, api, and exports pick it up)
  schemas.ts      zod request schemas, saved-record types, value type labels
  money.ts        integer cents helpers ("not entered" stays null, never 0)
  sampleData.ts   the test data portfolio
server/         express api
  app.ts          the app (routes, auth, errors)
  dev.ts          local dev server for npm run dev
  auth.ts         clerk, or the local dev user
  db/             mongoose connection + models (assets, valuationSnapshots, profiles)
  routes/         assets, valuations, profile, sample data, lookups, health
  lookups/        nhtsa (vin + recalls), cards (tcgdex + scryfall), metals (gold-api.com), all free; rentcast and vinaudit (need keys)
api/index.ts    vercel entry point (just exports server/app.ts)
src/            react site
  config.ts       app name and the clerk switch
  api/api.ts      the only file that calls fetch
  context/        AuthContext (clerk or dev user)
  hooks/          tanstack query hooks
  lib/            portfolio math, formatting, the asset form's logic, csv + pdf export
  views/          one file per page (LandingView, AuthView, OnboardingView, then the app pages)
  components/     charts, asset pieces, landing diagrams, onboarding, layout (AppGate decides who sees what), shadcn ui
  css/index.css   design tokens (colors live here for the steel and steam pass later)
```

## how the numbers work

- Three value types, never added together: fair market, liquidation (all recorded as dated observations), and cost basis (from the purchase price).
- Every value you record is kept with its date and source, so history builds up. Editing an asset's value adds a new observation instead of overwriting the old one. The newest value of each type is the current one.
- Values only change when someone records one, by typing it in, saving a lookup, or confirming a phone-capture draft.
- Totals always say how many assets they cover ("on 9 of 10"). Missing values are "Not entered", never $0.
- The portfolio chart shows recorded values; the asset page separates recorded values from provider market history. Vehicle projections are optional and labeled separately.


## Phone capture

**Add an asset** opens a choice: enter it manually, or upload a photo. The photo path shows a QR code and waits until a picture arrives. The code carries the capture session, so the phone does not sign in again. The upload is stored on that same account. A one-item link lasts 10 minutes. **Add photos** on an existing asset lasts 45 minutes. Cancel closes the link. The raw token is returned once and only its hash is stored.

Photos upload as JPEG and are stored in MongoDB for that account. Gemini (`GEMINI_API_KEY`) fills a draft. The desktop polls about once a second, then asks you to approve each filled field, one at a time, before the asset is saved. Skip the price if you do not want the suggested fair-market value. Adding photos to an asset that already exists only attaches the pictures. A one-item session closes after its draft is saved or discarded.

Lookups follow what Gemini guessed: a 17-character VIN is decoded (and priced with VinAudit when that key is set), trading cards use TCGdex or Scryfall, jewelry with metal, weight, and purity uses the melt value, and other goods use eBay asking prices when that connection exists. Homes are photos only until you add an address. Vehicle depreciation still appears on the asset page after confirm, and only if you also have a purchase price. It is not invented from the photo.

A QR code that points at `localhost` will not open on a phone. Use the deployed site, or run `npm run dev -- --host` and open the network address on the computer before scanning.

## Marketplace research and selling

Onboarding collects city, region, postal code, and country for marketplace research. Edit the selling location in Setup or through onboarding. Existing accounts can add a location without losing their assets.

Each asset has a Sell action and a selling panel with platform wordmarks, comparable-search links, selling links, and a copyable listing draft. Zillow is suggested for homes, Cars.com and Facebook for vehicles, Facebook and eBay for household items and tools, and eBay and Facebook for other items.

Live comparable research currently supports US items priced in USD through the eBay Browse API. Set `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` to production credentials with Browse access. Without that connection the app still offers targeted platform searches; it does not invent listings or estimates. Vehicle and home listing aggregation is not yet connected. Existing specialized card, metal, VIN, and property estimate lookups remain available.

The engine filters model, brand, variant, condition, and incompatible items before calculating an interquartile asking range from at least three relevant listings. Outliers are excluded. Active asking prices are explicitly distinguished from sold prices. Estimates can be recorded deliberately as fair market observations with their source. Research reports are private to the asset owner, retained with a timestamp, and invalidated when matching details or location change. Refresh is recommended after a day.

The dashboard keeps portfolio value history, gains and losses, category allocation, and a matched market-versus-quick-sale comparison. These use recorded values and show how many assets have the required data; no API key is needed for these charts. Each asset puts current values, history, and selling links first. Details, current-value lookups, vehicle projections, full observation entries, and selling-cost calculations expand only when needed.


## Historical market values (free sources)

Opening a page reads saved history only. It does not spend external history requests or overwrite the user's recorded estimates. Each source shows dated observations, its provenance, and the latest actual observation date; market series are not extended to today or projected backward.

- **Metals:** get a free key at https://gold-api.com/pricing and set `GOLD_API_KEY` in `.env.local` (and Vercel when deploying). Restart the API. On a Jewelry & metals asset, set metal, weight in grams, and purity, then choose **Market history → Load history**. The server fetches up to a year of daily average USD spot prices and scales them by the item's current fine metal content. This is a metal benchmark, not historical jewelry resale value. A shared MongoDB rolling-hour ledger limits calls to 10/hour for the key, including failed calls; daily data is cached across users for 24 hours. Calls made outside Gauge also consume the provider's allowance. Only the free daily endpoint is used.
- **Magic:** MTGJSON's free bulk download includes up to 90 days of retail/market history for exact printings. Set **Card game → Magic**, **Magic set code**, **Card number**, and **Finish** in Edit. Run `npm run sync:mtg-history` from the project root against the same database used by the app. This separately downloads set metadata, streams the large `AllPrices.json.gz` file, and saves only tracked printings. No API key or Patreon GraphQL access is required. Re-run to update prices or after adding different printings. The browser never downloads this bulk file. Providers and finishes are separate series; ungraded prices do not value graded copies.
- **Other assets:** existing recorded observations work immediately. Successful eBay research with at least three relevant listings now saves one daily asking-price midpoint per owner/item/matching version. Repeated research on the same UTC date updates that day's observation. These are active asks, not completed sales. Editing matching details starts a separate comparable series; deleting an asset removes its research snapshots. Previously overwritten reports cannot be recovered.

The Magic bulk file is roughly 140 MB compressed and over 1 GB expanded. Run the import locally, not inside a Vercel request. If your network blocks downloads, download the free file from https://mtgjson.com/downloads/all-files/ and run:

```bash
npm run sync:mtg-history -- /absolute/path/AllPrices.json.gz
```

If set metadata is blocked too, download the relevant set files (for example `MH3.json`) from MTGJSON into a directory and pass it as the second argument:

```bash
npm run sync:mtg-history -- /absolute/path/AllPrices.json.gz /absolute/path/set-files
```

No free historical home/car valuation provider has been added. RentCast stays as the current-value lookup; Pokémon rolling averages are not drawn as invented daily history. The MTGJSON import keeps public card prices separately from private user observations. Data source: https://mtgjson.com; license and attribution: https://mtgjson.com/license/.
