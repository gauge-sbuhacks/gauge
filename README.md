<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo/pipe-g-lockup-on-dark.svg">
    <img src="public/brand/logo/pipe-g-lockup-on-light.svg" alt="Gauge" width="320">
  </picture>
</p>

<p align="center"><strong>Know what everything you own is worth.</strong></p>

<p align="center">
  <a href="https://gaugeit.us">Live site</a> ·
  <a href="https://gauge-gauge4.vercel.app">Backup link</a> ·
  Built at <strong>SBU Hacks 2026</strong>
</p>

---

## The idea

Your digital assets already have great dashboards. Any brokerage or crypto app shows what you paid, what it's worth right now, whether you're up or down, and a chart of how it changed.

Your **physical assets** get none of that. For most people, a car, a home, a watch, or a card collection is worth more than their brokerage account, yet nobody can tell them what those things are worth today. That matters when you sell something, file an insurance claim, or just want to know your real net worth.

**Gauge gives the things you can touch the same treatment as the things on a screen:** a current value, a cost basis, gains and losses, liquidity, and a history over time.

## What it does

- **Add anything, one question at a time.** Pick a category (vehicles, real estate, watches, jewelry and metals, collectibles, electronics, home goods, tools) and Gus, our boiler-inspector mascot, asks only what that category needs.
- **Real market values, filled in for you.**
  - **Cars:** paste a VIN and Gauge decodes the year, make, and model, then pulls retail and trade-in values. Values can refresh every month on their own.
  - **Homes:** an address becomes an estimate from comparable homes nearby, with a likely range.
  - **Trading cards:** live market prices for Pokémon and Magic cards.
  - **Gold, silver, platinum, palladium:** melt value from the live spot price.
  - **Everything else:** an AI price check gives a ballpark, clearly labeled as a rough estimate.
- **A portfolio view for physical things.** Total value, what you paid versus what it's worth now, a breakdown by category, and a value history.
- **Liquidity, not just price.** Every item tracks **fair market value** (a fair sale between a willing buyer and seller) and **quick-sale value** (what a dealer, pawn shop, or gold buyer would pay today).
- **Snap it from your phone.** Scan a QR code and photos taken on your phone go straight to your desktop session, where AI helps identify the item.
- **Ready for an insurance claim.** Export your whole inventory as a PDF or CSV.
- **Selling help.** Each item has a sell panel with listing links for the right marketplaces and a copyable listing draft.

## Try it (for judges)

1. Open **[gaugeit.us](https://gaugeit.us)** and click **Create your account**. Sign up with any email or Google.
2. Answer the three quick onboarding questions.
3. On the welcome screen, either:
   - click **Explore with test data** to load a sample portfolio of 10 items (a RAV4, a house, a Rolex, a graded Charizard, gold coins, and more) with value history, or
   - click **Add your first asset** and try one of these:

| Try adding | What to enter | What happens |
| --- | --- | --- |
| A car | Vehicles → year, make, model, mileage (or a VIN and **Decode**) | **Get market value** returns retail and trade-in prices |
| A house | Real estate → street, city, state, ZIP | **Get home estimate** returns a value, a range, and nearby comparables |
| A Charizard | Collectibles → Trading card → Pokémon, Base Set, 4/102, name "Charizard" | The price fills in from live card market data |
| A MacBook | Electronics → brand Apple, model "MacBook Pro 14 M3" | The AI price check fills in a rough estimate |
| A gold necklace | Jewelry & metals → Jewelry, Gold, purity 12k, weight 10 g | Melt value from today's gold price |

Every account is private. You only ever see the things you added.

## Where the numbers come from

| Asset | Source | What it gives |
| --- | --- | --- |
| Vehicles | [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) + [VinAudit](https://www.vinaudit.com/) | VIN decoding and recalls; retail and trade-in market values |
| Real estate | [RentCast](https://www.rentcast.io/) | Automated home value with nearby comparable homes |
| Trading cards | [TCGdex](https://tcgdex.dev/) (Pokémon), [Scryfall](https://scryfall.com/) and [MTGJSON](https://mtgjson.com/) (Magic) | Current market prices and Magic price history |
| Precious metals | [gold-api.com](https://gold-api.com/) | Live spot prices for melt value |
| Everything else | Google Gemini | Photo identification and an AI price check when no market source has a price |

Gauge is honest about its numbers:

- **Every value says where it came from** and when, so you can tell a market price from a rough estimate.
- **Nothing is invented.** A value you haven't entered shows as "Not entered", never $0. History is built from real dated values, not made-up past prices.
- **Melt value is a floor.** For jewelry, Gauge says so, since design, brand, or stones can make a piece worth more.

## How it's built

```mermaid
flowchart LR
    browser["React web app"] -->|"/api"| api["Express API<br/>(Vercel function)"]
    phone["Phone (QR capture)"] --> api
    api --> db[("MongoDB Atlas")]
    api --> clerk["Clerk sign-in"]
    api --> providers["Value providers<br/>NHTSA · VinAudit · RentCast<br/>TCGdex · Scryfall · gold-api.com · Gemini"]
    cron["Vercel cron (daily)"] --> api
```

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, Recharts, and @react-pdf/renderer for the PDF inventory.
- **Backend:** Express 5 in TypeScript with Mongoose on MongoDB Atlas. The same app runs locally and as a Vercel serverless function. A daily Vercel cron job refreshes vehicle values that are due for their monthly update.
- **Auth and privacy:** Clerk sign-in. Every database query is filtered by the signed-in owner. VINs and addresses are sent in request bodies, never in URLs, and an address only goes to RentCast when you ask for an estimate.
- **Data model:** money is stored in integer cents. Each value is a dated observation, so editing a value adds a new point to its history instead of overwriting the old one.
- **Protecting free quotas:** repeat lookups reuse recent answers in the browser and on the server, and paid lookups have per-person hourly limits.

## Team

- **Ashton Reyes:** frontend, design, and the Gauge brand
- **Sri Atragada:** backend, value providers, and phone capture
- **Bryce Whiteside:** backend, value history, and resale dashboards

---

# For developers

Everything below is for running and working on Gauge yourself.

## to run it

You need **Node 22 or newer**.

```bash
npm install
npm run dev
```

That starts two things together:

- the site on http://localhost:5180 (vite)
- the api on http://localhost:3180 (express). vite forwards every `/api` request to it

Open the site and load the sample portfolio (a 2021 Toyota RAV4, a family home, and 8 more) with **Explore with test data** after onboarding, or from the Setup page. The **Setup** page (`/settings`, not linked in the menu) shows what's connected and what still needs a key.

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
| `VINAUDIT_API_KEY` | vehicle retail/trade-in values; VIN-free estimates also need Specifications / Vehicle Selections access |
| `GEMINI_API_KEY` | identifying items from phone photos, and the AI price check when no provider has a price |
| `CRON_SECRET` | protects the daily cron that refreshes monthly vehicle values (Vercel production only) |
| `GOLD_API_KEY` | historical daily metal benchmarks; free plan, 10 history/OHLC requests per hour |
| `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | comparable active listings; no historical sold-price access |
| `THEWATCH_API_KEY` | optional. The add flow no longer uses The Watch API; watches are priced by the AI price check |
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

The `test` keys are fine for the hackathon, locally, on the vercel.app URL, and on gaugeit.us. With Clerk on, each teammate signs up in the app with their own email and gets their own portfolio, even on the shared database.

With Clerk on, signed-out visitors see the landing page at `/`, sign in at `/sign-in` or `/sign-up`, and answer three onboarding questions (`/onboarding`) the first time. Without Clerk keys, the local dev user goes straight to onboarding, and the landing page is still at `/home`. To see onboarding again locally, delete your profile: `mongosh gauge --eval 'db.profiles.deleteMany({})'`.

### RentCast (home values, optional)

1. Go to the API dashboard at https://app.rentcast.io/app/api and sign in (this creates the account)
2. **Select Plan** and pick the free one (50 requests a month; it may ask for a card because extra requests are billed)
3. **Create API Key** and set `RENTCAST_API_KEY`
4. When adding a house, click **Get home estimate** on the value step. On a saved house, open **Find a current value, Get an estimate**. Each lookup uses one request; the same address is cached for a day, and each person can run 5 an hour

### VinAudit (vehicle market values, optional)

1. Request a trial at https://data.vinaudit.com/pricing (up to 100 queries). Enable **Market Values** and, for estimates without a VIN, **Specifications / Vehicle Selections** on the key
2. Set `VINAUDIT_API_KEY`
3. Enter **year, make, model, and mileage** when adding a vehicle. On the value step, choose **Get market value**, then use the retail or trade-in estimate. The same lookup is available on a saved vehicle's **Lookups** panel. A full 17-character VIN remains an optional shortcut and takes precedence when provided
4. Trim is optional. Without it, Gauge chooses a provider-listed reference trim (Base when available), prominently labels the assumption, and offers trim choices to refine the estimate. It does not infer individual vehicle history or save the assumed trim as an actual vehicle detail. The source and assumptions are kept with an estimate the user applies
5. A lookup uses two price requests, plus a selections request when no VIN is supplied. Both selections and results are cached for a day, and each person can run 10 an hour

Run `npm exec -- tsx scripts/check-vehicle-value.ts` for a live VIN-free smoke test, or `npm exec -- tsx scripts/check-vehicle-value.ts --vin` for the VIN path. These use your locally configured key and provider quota; output contains only the result summary, never credentials. If VIN pricing works but Vehicle Selections returns HTTP 401, ask VinAudit to enable Specifications / Vehicle Selections for that key.

#### Monthly vehicle updates

- When applying a VinAudit estimate, **Update this value monthly** is on by default. Saving the estimate schedules the next refresh one calendar month later. For an existing vehicle, use **Monthly vehicle updates** on its detail page to select fair-market and/or quick-sale values. Existing records remain unchanged until enabled.
- **Refresh now** records the selected estimates immediately (provider results may be cached for 24 hours). The panel shows the last successful update, next due date, and any retry message. A manually recorded value stops automatic updates for that value type; other selected types continue.
- Updates use the last recorded mileage, condition, title, and selected trim. They append dated observations, retain the original source/assumptions, and never fabricate past prices after downtime. Unavailable provider data leaves the previous values in place and schedules a retry the next day. Sample data and non-USD vehicles are excluded.
- **Local development:** `npm run dev` checks due vehicles at API startup and every 24 hours while it remains running. You can also run `npm run refresh:vehicle-values` from any scheduled server process. A computer that is off cannot run local updates; due vehicles are caught up on the next check.
- **Vercel production:** set a server-only random `CRON_SECRET` in the project's **Production** environment, keep `MONGODB_URI` and `VINAUDIT_API_KEY` configured, then deploy this version. `vercel.json` schedules `GET /api/cron/vehicle-values` daily at 12:00 UTC; only vehicles with a monthly refresh due make provider requests. The endpoint checks the `Authorization: Bearer <CRON_SECRET>` header before accessing data. Vercel injects that header automatically. Cron jobs run against production deployments; a local environment file does not configure Vercel.
- The worker uses database leases to prevent overlapping jobs and a unique snapshot key per vehicle, value type, and refresh cycle to make retries idempotent. It processes bounded batches within a four-minute budget; any backlog remains due for the next daily check. An account authentication/quota failure stops further batches.

`npm exec -- tsx scripts/check-monthly-vehicle-values.ts` performs an optional **live** integration check. It creates one isolated temporary vehicle, calls VinAudit, verifies its saved snapshot and next monthly date, and removes only that test's records. It consumes provider quota; the regular `npm test` suite uses mocks and does not call VinAudit.

The **Depreciation** card on vehicles needs no key. It uses the purchase price and date, the latest fair market value, and the mileage now and when bought. The five-year projection extends the car's own yearly rate (or a rule of thumb when its history is under a year) and is labeled as a projection.

### Card prices and metal values (free, no keys)

- **Trading cards**: on a collectible with type Trading card, **Lookups, Card prices** searches by name, set, and number. Pokémon comes from TCGdex (the Pokémon TCG API was failing when we tested it), Magic from Scryfall. Both return TCGplayer market prices for ungraded copies
- **Gold, silver, platinum, palladium**: on a Jewelry & metals asset with the metal, total weight, and purity filled in, **Lookups, Melt value** multiplies the live spot price from gold-api.com by the weight and purity

### Automatic values and lookup limits

- On the add flow's value step, Gauge fills in fair market and quick-sale when it can: VinAudit for cars, card prices, melt value for metals, eBay asking prices when connected, and otherwise the Gemini **AI price check**. The step labels a filled-in value as a rough estimate and says where it came from. Quick-sale defaults to about 85% of fair market when the source doesn't give one.
- The same lookup with the same inputs reuses its answer in the browser for 10 minutes, so repeat clicks don't call the provider again. AI price checks are cached on the server for 6 hours.
- Per-person limits on the server: 30 lookups a minute overall, plus 5 home estimates an hour, 10 vehicle estimates an hour, and 20 automatic price checks every 10 minutes.

## deploying (vercel)

One Vercel project, same idea as GradientV: the vite site is static, and `api/index.ts` runs the express app as a function. `vercel.json` sends `/api/*` to that function and everything else to `index.html`.

1. Push to GitHub, then **Add New Project** in Vercel and import the repo (the framework is set in `vercel.json`)
2. Before the first deploy, add the environment variables: `MONGODB_URI` (with `/gauge`), and the three Clerk keys
3. Deploy. After that, every push to `main` redeploys automatically

Without Clerk keys the deployed api refuses requests on purpose (unless `GAUGE_ALLOW_DEV_AUTH=true`), so a public URL never exposes a shared account.

**Vercel free (Hobby) plan and teammates:** Hobby only supports teammates' pushes deploying on **public** repos. On a private repo, only the Vercel account owner's commits deploy. Hobby is also for non-commercial use, which a hackathon is.

**Custom domain:** gaugeit.us is registered at Porkbun. Its DNS has an `A` record for the root domain and a `CNAME` for `www`, both copied from Vercel's **Settings, Domains** page. The root domain redirects to `www`.

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
  capture/        phone photo identification and the automatic pricing pipeline (providers first, then the AI price check)
api/index.ts    vercel entry point (just exports server/app.ts)
src/            react site
  config.ts       app name and the clerk switch
  api/api.ts      the only file that calls fetch
  context/        AuthContext (clerk or dev user)
  hooks/          tanstack query hooks
  lib/            portfolio math, formatting, the asset form's logic, csv + pdf export
  views/          one file per page (LandingView, AuthView, OnboardingView, then the app pages)
  components/     charts, asset pieces, landing diagrams, onboarding, layout (AppGate decides who sees what), shadcn ui
  css/index.css   design tokens
```

## how the numbers work

- Three value types, never added together: fair market, liquidation (all recorded as dated observations), and cost basis (from the purchase price).
- Every value you record is kept with its date and source, so history builds up. Editing an asset's value adds a new observation instead of overwriting the old one. The newest value of each type is the current one.
- Values only change when someone records one, by typing it in, saving a lookup, or confirming a phone-capture draft.
- Totals always say how many assets they cover ("on 9 of 10"). Missing values are "Not entered", never $0.
- The portfolio chart shows recorded values; the asset page separates recorded values from provider market history. Vehicle projections are optional and labeled separately.


## Phone capture

**Add an asset** opens a choice: enter it manually, or upload a photo. The photo path shows a QR code and waits until a picture arrives. The code carries the capture session, so the phone does not sign in again. The upload is stored on that same account. A one-item link lasts 10 minutes. **Add photos** on an existing asset lasts 45 minutes. Cancel closes the link. The raw token is returned once and only its hash is stored.

Photos upload as JPEG and are stored in MongoDB for that account. Identification is two passes: first the category, then every question that category asks (for a car, make, model, and year, then mileage and the rest). A VIN, card, or metal is priced from its own source. Watches no longer use The Watch API (it never returned usable prices); they go to the AI price check like any other item. If no provider returns a fair market value, a short Gemini price check estimates fair market only. Saving the draft requires fair market, quick-sale, and what you paid (cost basis). Adding photos to an asset that already exists only attaches the pictures. A one-item session closes after its draft is saved or discarded.

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
