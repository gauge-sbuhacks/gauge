# Gauge

A net-worth tracker for the things you can touch. You record what you own, what you paid, and what it's worth now, and it turns that into a portfolio: totals per value type, allocation charts, value history, a "pressure" reading for uninsured or undocumented value, and claim-ready exports.

This is the manual-first version from the plan: everything works by typing things in. Photos, AI identification, and QR phone capture come later.

## to run it

You need **Node 22 or newer**.

```bash
npm install
npm run dev
```

That starts two things together:

- the site on http://localhost:5180 (vite)
- the api on http://localhost:3180 (express). vite forwards every `/api` request to it

Open the site, hit **Test data** to load the sample portfolio (2020 Cadillac XT6, 89 Carnation Road, and 8 more), and click around. The **Setup** page in the app shows what's connected and what still needs a key.

With no `.env.local` at all, the app uses MongoDB on your own computer (`mongodb://127.0.0.1:27017/gauge`) and signs you in as the "local dev user". Once the team has the shared keys (below), you don't need MongoDB installed.

Other scripts:

- `npm run build` type-checks everything, then builds the site into `dist/`
- `npm run typecheck` only the type check
- `npm run lint` oxlint

## keys

Copy `.env.example` to `.env.local`, fill in what you have, and restart `npm run dev`. **Never commit `.env.local`** (git already ignores it). Teammates get the values from Ashton privately (a DM or password manager), not through GitHub.

| name | what it's for |
| --- | --- |
| `MONGODB_URI` | the Atlas database. Locally it falls back to MongoDB on your own computer |
| `VITE_CLERK_PUBLISHABLE_KEY` | turns on the Clerk sign-in screen (browser side) |
| `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | lets the api check who's calling. Set all three Clerk keys together |
| `RENTCAST_API_KEY` | home value estimates on real estate assets (free plan: 50 a month) |
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

The `test` keys are fine for the hackathon, locally and on the vercel.app URL. With Clerk on, each teammate signs up in the app with their own email and gets their own portfolio, even on the shared database.

### RentCast (home values, optional)

1. Go to the API dashboard at https://app.rentcast.io/app/api and sign in (this creates the account)
2. **Select Plan** and pick the free one (50 requests a month; it may ask for a card because extra requests are billed)
3. **Create API Key** and set `RENTCAST_API_KEY`
4. On a real estate asset, open **Lookups, Get an estimate**. Each lookup uses one request; the same address is cached for a day

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
  db/             mongoose connection + models (assets, valuationSnapshots)
  routes/         assets, valuations, sample data, lookups, health
  lookups/        nhtsa (vin + recalls, free) and rentcast (needs a key)
api/index.ts    vercel entry point (just exports server/app.ts)
src/            react site
  config.ts       app name and the clerk switch
  api/api.ts      the only file that calls fetch
  context/        AuthContext (clerk or dev user)
  hooks/          tanstack query hooks
  lib/            portfolio math, formatting, the asset form's logic, csv + pdf export
  views/          one file per page
  components/     charts, asset pieces, layout, shadcn ui
  css/index.css   design tokens (colors live here for the steel and steam pass later)
```

## how the numbers work

- Four value types, never added together: fair market, replacement, liquidation (all recorded as dated observations), and cost basis (from the purchase price).
- Every value you record is kept with its date and source, so history builds up. Editing an asset's value adds a new observation instead of overwriting the old one. The newest value of each type is the current one.
- Values only change when someone records one, by typing it in or saving a lookup result. Nothing fetches prices in the background yet.
- Totals always say how many assets they cover ("on 9 of 10"). Missing values are "Not entered", never $0.
- Charts only show recorded values. Nothing is projected.
- Pressure = share of value (replacement cost, or fair market when replacement is missing) that is uninsured, or insured but missing proof (no current value, or no serial and no purchase record).
