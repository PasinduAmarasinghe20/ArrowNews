/* =====================================================================
   MarketPulse — frontend app
   Works in two modes:
   1. DEMO MODE  (default): shows sample news + sample chat, live prices.
   2. LIVE MODE  : fill in SUPABASE_URL and SUPABASE_ANON_KEY below after
      following README.md (Supabase free + GitHub Actions cron).
   ===================================================================== */

const SUPABASE_URL = "";        // e.g. "https://xyzcompany.supabase.co"
const SUPABASE_ANON_KEY = "";   // anon/public key (safe to expose in frontend)

const LIVE = SUPABASE_URL && SUPABASE_ANON_KEY;
const sb = LIVE ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ---------------------------------------------------------------- clock */
setInterval(() => {
  document.getElementById("clock").textContent =
    new Date().toLocaleTimeString("en-GB", { timeZone: "UTC", hour12: false }) + " UTC";
}, 1000);

/* ------------------------------------------------------------- connection */
const badge = document.getElementById("conn-status");
badge.textContent = LIVE ? "live" : "demo mode";
badge.classList.add(LIVE ? "live" : "demo");

/* ================================================================ TICKER */
async function loadTicker() {
  const track = document.getElementById("ticker");
  try {
    const [coin, gold, fx] = await Promise.all([
      fetch("https://api.coinlore.net/api/tickers/?start=0&limit=6").then(r => r.json()),
      fetch("https://api.gold-api.com/price/XAU").then(r => r.json()),
      fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP").then(r => r.json()),
    ]);

    const items = [];

    coin.data.forEach(c => {
      const chg = parseFloat(c.percent_change_24h);
      items.push({ sym: c.symbol + "/USD", price: fmt(c.price_usd), chg, id: "c-" + c.symbol });
    });

    if (gold && gold.price) {
      items.push({ sym: "XAU/USD", price: fmt(gold.price), chg: gold.chg ?? null, id: "gold" });
    }

    Object.entries(fx.rates).forEach(([cur, rate]) => {
      items.push({ sym: "USD/" + cur, price: rate.toFixed(4), chg: null, id: "fx-" + cur });
    });

    const html = items.map(i => {
      const cls = i.chg == null ? "muted" : i.chg >= 0 ? "up" : "dn";
      const arrow = i.chg == null ? "" : (i.chg >= 0 ? "▲" : "▼") + " ";
      const prev = track.dataset[i.id];
      const flash = prev !== undefined && prev !== i.price ? (i.chg >= 0 ? "flash-up" : "flash-dn") : "";
      track.dataset[i.id] = i.price;
      return `<span class="ticker-item ${flash}"><b>${i.sym}</b>${i.price}
              <span class="${cls}">${arrow}${i.chg == null ? "" : Math.abs(i.chg).toFixed(2) + "%"}</span></span>`;
    }).join("");

    track.innerHTML = html;
  } catch (e) {
    track.innerHTML = `<span class="ticker-item muted">Price feed temporarily unavailable</span>`;
  }
}
function fmt(v) {
  const n = parseFloat(v);
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}
loadTicker();
setInterval(loadTicker, 30000); // refresh every 30s

/* ================================================================== NEWS */
const FEEDS = {
  forex: ["FXStreet", "ForexLive", "DailyFX"],
  crypto: ["CoinDesk", "CoinTelegraph", "Decrypt"],
  gold: ["Kitco", "World Gold Council", "BullionVault"],
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return Math.floor(s / 86400) + " d ago";
}

function renderNews(items, filter) {
  const feed = document.getElementById("news-feed");
  const list = filter === "all" ? items : items.filter(n => n.asset_tag === filter);
  if (!list.length) { feed.innerHTML = `<div class="empty">No ${filter} news yet — the bot is fetching…</div>`; return; }
  feed.innerHTML = list.map(n => `
    <article class="news-card">
      <div class="news-top">
        <span class="tag tag-${n.asset_tag}">${n.asset_tag}</span>
        <span class="source">${esc(n.source)}</span>
      </div>
      <h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
      <div class="time">${timeAgo(n.published_at)}</div>
    </article>`).join("");
}

async function loadNews(filter) {
  if (LIVE) {
    const { data, error } = await sb
      .from("news_items")
      .select("title,url,source,asset_tag,published_at")
      .order("published_at", { ascending: false })
      .limit(60);
    renderNews(error ? [] : data, filter);
  } else {
    renderNews(DEMO_NEWS, filter);
  }
}

document.getElementById("news-tabs").addEventListener("click", e => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll("#news-tabs .tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  loadNews(btn.dataset.filter);
});

/* ================================================================== CHAT */
let currentRoom = "all";
let username = localStorage.getItem("mp_username") ||
  (localStorage.setItem("mp_username", "trader_" + Math.random().toString(36).slice(2, 7)),
   localStorage.getItem("mp_username"));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function addMsg(m) {
  const box = document.getElementById("chat-messages");
  const div = document.createElement("div");
  div.className = "msg" + (m.username === username ? " own" : "");
  div.innerHTML = `<div class="msg-head"><b>${esc(m.username)}</b><span>${timeAgo(m.created_at)}</span></div>
                   <div class="msg-body">${esc(m.body)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function loadChat() {
  const box = document.getElementById("chat-messages");
  box.innerHTML = "";
  if (LIVE) {
    const { data } = await sb.from("messages")
      .select("username,body,created_at").eq("room", currentRoom)
      .order("created_at", { ascending: true }).limit(50);
    (data || []).forEach(addMsg);
  } else {
    DEMO_CHAT.filter(m => m.room === currentRoom).forEach(addMsg);
  }
}

document.getElementById("chat-rooms").addEventListener("click", e => {
  const btn = e.target.closest(".room");
  if (!btn) return;
  document.querySelectorAll(".room").forEach(r => r.classList.remove("active"));
  btn.classList.add("active");
  currentRoom = btn.dataset.room;
  loadChat();
});

document.getElementById("chat-form").addEventListener("submit", async e => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const body = input.value.trim();
  if (!body) return;
  input.value = "";

  if (LIVE) {
    const m = { room: currentRoom, username, body };
    const { error } = await sb.from("messages").insert(m);
    if (!error) addMsg({ ...m, created_at: new Date().toISOString() });
  } else {
    addMsg({ username, body, created_at: new Date().toISOString() });
  }
});

if (LIVE) {
  sb.channel("chat")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      payload => {
        if (payload.new.room === currentRoom && payload.new.username !== username) addMsg(payload.new);
      })
    .subscribe();
}

/* --------------------------------------------------------- demo content */
const now = Date.now();
const DEMO_NEWS = [
  { title: "Dollar eases as traders trim Fed rate-hike bets ahead of FOMC minutes", url: "#", source: "FXStreet", asset_tag: "forex", published_at: new Date(now - 9e5).toISOString() },
  { title: "Bitcoin ETF inflows hit weekly high as institutional demand returns", url: "#", source: "CoinDesk", asset_tag: "crypto", published_at: new Date(now - 2.5e6).toISOString() },
  { title: "Gold steadies near $2,665 as central-bank buying offsets firm yields", url: "#", source: "Kitco", asset_tag: "gold", published_at: new Date(now - 3.4e6).toISOString() },
  { title: "ECB officials signal patience on cuts; euro holds gains vs dollar", url: "#", source: "ForexLive", asset_tag: "forex", published_at: new Date(now - 5e6).toISOString() },
  { title: "Ethereum staking yields climb as network activity rebounds", url: "#", source: "CoinTelegraph", asset_tag: "crypto", published_at: new Date(now - 7e6).toISOString() },
  { title: "Central banks bought 289 tonnes of gold in Q2, WGC report shows", url: "#", source: "World Gold Council", asset_tag: "gold", published_at: new Date(now - 9e6).toISOString() },
  { title: "USD/JPY: BoJ intervention talk caps upside near 152", url: "#", source: "DailyFX", asset_tag: "forex", published_at: new Date(now - 1.1e7).toISOString() },
];

const DEMO_CHAT = [
  { room: "all", username: "Aria_K", body: "Watching $2,650 support on XAU before adding — Fed speakers this week.", created_at: new Date(now - 3e5).toISOString() },
  { room: "all", username: "FX_Dan", body: "EUR/USD long above 1.0830 if CPI prints soft. SL tight.", created_at: new Date(now - 9e5).toISOString() },
  { room: "all", username: "satoshi_sam", body: "BTC holding 96k range, funding neutral. No rush.", created_at: new Date(now - 1.5e6).toISOString() },
  { room: "forex", username: "pips_hunter", body: "GU respecting the daily demand zone, eyes on London open.", created_at: new Date(now - 2e6).toISOString() },
  { room: "crypto", username: "hodl_wolf", body: "ETH breakout looks clean above 3.5k on volume.", created_at: new Date(now - 2.6e6).toISOString() },
  { room: "gold", username: "metal_mind", body: "Kitco article on CB buying is bullish long-term for gold.", created_at: new Date(now - 3.2e6).toISOString() },
];

/* ================================================== FEAR & GREED GAUGE */
async function loadFng() {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1");
    const d = await r.json();
    const v = parseInt(d.data[0].value, 10);
    const label = d.data[0].value_classification;
    const arc = document.getElementById("fng-arc");
    const C = 251.3; // arc length
    arc.style.strokeDashoffset = C - (C * v / 100);
    arc.style.stroke = v < 25 ? "var(--danger)" : v < 45 ? "var(--gold)" : v < 55 ? "var(--muted)" : "var(--accent)";
    document.getElementById("fng-needle").textContent = v;
    const lbl = document.getElementById("fng-label");
    lbl.textContent = label;
    lbl.style.color = arc.style.stroke;
    document.getElementById("fng-updated").textContent = "updated " + timeAgo(new Date(+d.data[0].timestamp * 1000));
  } catch (e) {
    document.getElementById("fng-label").textContent = "unavailable";
  }
}

/* ================================================== ECONOMIC CALENDAR */
function renderCalendar(events) {
  const list = document.getElementById("cal-list");
  if (!events.length) { list.innerHTML = `<div class="empty">No major events scheduled</div>`; return; }
  list.innerHTML = events.map(e => {
    const impactCls = e.impact === "high" ? "impact-high" : e.impact === "medium" ? "impact-med" : "impact-low";
    const when = new Date(e.date);
    return `<div class="cal-item">
      <span class="cal-date">${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      <span class="cal-flag">${esc(e.country)}</span>
      <span class="cal-event">${esc(e.event)}</span>
      <span class="impact ${impactCls}">${e.impact}</span>
    </div>`;
  }).join("");
}

async function loadCalendar() {
  const list = document.getElementById("cal-list");
  if (!FINNHUB_KEY) {
    document.getElementById("cal-badge").textContent = "demo events";
    renderCalendar(DEMO_EVENTS);
    return;
  }
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const d = await r.json();
    const events = (d.economicCalendar || [])
      .filter(e => ["US", "EU", "GB", "JP", "CN", "CH", "DE", "FR", "AU", "CA", "NZ"].includes(e.country))
      .map(e => ({
        country: e.country,
        event: e.event,
        impact: (e.impact || "").toLowerCase() || "low",
        date: e.date,
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 40);
    renderCalendar(events);
  } catch (e) {
    list.innerHTML = `<div class="empty">Calendar unavailable right now</div>`;
  }
}

const DEMO_EVENTS = [
  { country: "US", event: "FOMC Meeting Minutes", impact: "high", date: new Date(Date.now() + 864e5).toISOString() },
  { country: "US", event: "CPI Inflation YoY", impact: "high", date: new Date(Date.now() + 2 * 864e5).toISOString() },
  { country: "US", event: "Initial Jobless Claims", impact: "medium", date: new Date(Date.now() + 3 * 864e5).toISOString() },
  { country: "EU", event: "ECB Monetary Policy Statement", impact: "high", date: new Date(Date.now() + 4 * 864e5).toISOString() },
  { country: "GB", event: "GDP Growth Rate QoQ", impact: "medium", date: new Date(Date.now() + 5 * 864e5).toISOString() },
  { country: "JP", event: "BoJ Interest Rate Decision", impact: "high", date: new Date(Date.now() + 6 * 864e5).toISOString() },
  { country: "US", event: "Fed Chair Speech", impact: "medium", date: new Date(Date.now() + 6.5 * 864e5).toISOString() },
];

/* ------------------------------------------------------------------ init */
if (!LIVE) {
  const box = document.getElementById("chat-messages");
  const note = document.createElement("div");
  note.className = "notice";
  note.textContent = "Demo mode — add Supabase keys (see README.md) to enable live chat & real news.";
  box.before(note);
}
loadNews("all");
loadChat();
loadFng();
loadCalendar();
setInterval(loadFng, 3600000); // refresh gauge hourly
