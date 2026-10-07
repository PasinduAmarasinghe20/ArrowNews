# MarketPulse

Zero-cost forex + crypto + gold news aggregator with a live community chat.

**Stack:** GitHub Pages (hosting) · Supabase free tier (database + realtime chat) · GitHub Actions (news-fetching cron) · Free public price APIs (CoinLore, gold-api.com, Frankfurter).

Total monthly cost: **$0**.

---

## 1. Deploy the frontend (5 minutes)

1. Create a new GitHub repository and upload all files from this folder.
2. In the repo: **Settings → Pages → Source: Deploy from branch → `main` / root → Save**.
3. Wait ~1 minute — your site is live at `https://<username>.github.io/<repo>/`.

It already works in **demo mode** (sample news + chat, live prices). The steps below switch on live data.

## 2. Create the free database (Supabase)

1. Sign up at [supabase.com](https://supabase.com) (free tier, no card).
2. **New project** → choose a region near you → set a database password.
3. Open **SQL Editor** → paste the full contents of `supabase/schema.sql` → **Run**.
   This creates the `news_items` and `messages` tables, enables realtime chat, and sets read/write permissions.
4. **Settings → API**. Copy:
   - `Project URL`
   - `anon public` key (safe for frontend)
   - `service_role` key (**secret — never put in frontend or git**)

## 3. Connect the frontend

In `app.js`, fill in the two lines at the top:

```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";   // anon public key
```

Commit → GitHub Pages redeploys automatically. Chat + real news are now live.

## 4. Switch on the news bot

1. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, and add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key
2. Go to the **Actions** tab → **Fetch market news** → **Run workflow** (first run may need you to click "I understand" to enable Actions).
3. The bot now fetches all RSS feeds every 15 minutes automatically. The schedule uses ~44 of your 2,000 free minutes/month.

## 5. Optional: live economic calendar

1. Get a free API key at [finnhub.io](https://finnhub.io) (no card, free tier includes the economic calendar).
2. Paste it into the `FINNHUB_KEY` line at the top of `app.js`.
3. Commit — the calendar now shows real events for the next 7 days. Without a key it shows demo events, and the Fear & Greed gauge works either way (free API, no key).

## 6. Optional: custom domain (still free)

Repo **Settings → Pages → Custom domain** → enter e.g. `marketpulse.xyz`, then add a `CNAME` record pointing to `<username>.github.io` at your registrar. GitHub provides free HTTPS automatically.

---

## Customizing

- **Add/remove news sources:** edit the `FEEDS` list in `ingest/ingest.mjs` (any RSS feed works — give it a tag `forex`, `crypto`, or `gold`).
- **More chat safety:** rate-limit inserts with a Supabase Edge Function, or enable Supabase Auth for real accounts later.
- **Price ticker:** edit the `loadTicker()` function in `app.js` to add more coins or currency pairs.

## Free-tier limits you'll never hit at launch

| Resource | Free limit | Your usage |
|---|---|---|
| GitHub Pages | 100 GB/month bandwidth | ~1 GB |
| GitHub Actions | 2,000 min/month | ~44 min |
| Supabase database | 500 MB | ~50 MB |
| Supabase realtime | concurrent connections | fine for chat |
