/* MarketPulse news bot — fetches RSS feeds and stores them in Supabase.
   Runs on GitHub Actions (free cron). No npm dependencies. Node 20+. */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only, never in frontend

const FEEDS = [
  // ---- crypto ----
  { tag: "crypto", source: "CoinDesk",      url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { tag: "crypto", source: "CoinTelegraph", url: "https://cointelegraph.com/rss" },
  // ---- gold ----
  { tag: "gold",   source: "Kitco",         url: "https://www.kitco.com/rss/news.rss" },
  // ---- forex / macro ----
  { tag: "forex",  source: "FXStreet",      url: "https://www.fxstreet.com/rss/news" },
  { tag: "forex",  source: "DailyFX",       url: "https://www.dailyfx.com/feeds/market-news" },
];

/* Google News RSS is a free backup source for any topic — uncomment to use:
const GOOGLE_QUERIES = [
  { tag: "forex",  q: "forex OR EUR/USD OR Federal Reserve" },
  { tag: "gold",   q: "gold price OR XAU/USD" },
  { tag: "crypto", q: "bitcoin OR ethereum" },
];
*/

function decodeXml(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function parseRss(xml, fallbackSource) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 20) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return t ? decodeXml(t[1].trim()) : "";
    };
    const title = pick("title");
    const link = pick("link").trim();
    const pubDate = pick("pubDate") || pick("dc:date") || pick("date");
    if (!title || !link) continue;
    items.push({
      title: title.slice(0, 300),
      url: link,
      source: fallbackSource,
      asset_tag: "", // filled by caller
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "MarketPulseBot/1.0 (+news aggregator)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    return parseRss(xml, feed.source).map(n => ({ ...n, asset_tag: feed.tag }));
  } catch (e) {
    console.warn(`[skip] ${feed.source}: ${e.message}`);
    return [];
  }
}

async function upsertNews(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/news_items`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error("Supabase insert failed: " + (await res.text()).slice(0, 200));
}

const results = await Promise.all(FEEDS.map(fetchFeed));
const all = results.flat();

if (!all.length) {
  console.log("No items fetched this run (feeds may be down). Skipping insert.");
  process.exit(0);
}

// upsert in batches of 100
for (let i = 0; i < all.length; i += 100) {
  await upsertNews(all.slice(i, i + 100));
}

const byTag = {};
all.forEach(n => byTag[n.asset_tag] = (byTag[n.asset_tag] || 0) + 1);
console.log(`Inserted ${all.length} items:`, byTag);
