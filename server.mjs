import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const STEAM_TIMEOUT_MS = Number(process.env.STEAM_TIMEOUT_MS || 12000);
const PAGE_SIZE = 50;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const FALLBACK_GAMES = [
  [105600, "Terraria", 97, 1180000, "¥1,200"],
  [4000, "Garry's Mod", 96, 1040000, "¥1,200"],
  [292030, "The Witcher 3: Wild Hunt", 96, 850000, "¥5,588"],
  [413150, "Stardew Valley", 98, 820000, "¥1,480"],
  [227300, "Euro Truck Simulator 2", 97, 750000, "¥2,300"],
  [550, "Left 4 Dead 2", 97, 720000, "¥1,200"],
  [739630, "Phasmophobia", 96, 640000, "¥2,300"],
  [367520, "Hollow Knight", 97, 430000, "¥1,700"],
  [960090, "Bloons TD 6", 97, 410000, "¥1,480"],
  [620, "Portal 2", 98, 390000, "¥1,200"],
  [1145360, "Hades", 98, 270000, "¥2,800"],
  [322330, "Don't Starve Together", 95, 250000, "¥1,480"],
  [250900, "The Binding of Isaac: Rebirth", 97, 245000, "¥1,480"],
  [427520, "Factorio", 98, 205000, "¥4,500"],
  [294100, "RimWorld", 98, 200000, "¥4,200"],
  [548430, "Deep Rock Galactic", 97, 195000, "¥3,090"],
  [646570, "Slay the Spire", 97, 170000, "¥2,800"],
  [2379780, "Balatro", 98, 145000, "¥1,700"],
  [504230, "Celeste", 97, 105000, "¥1,980"],
  [1149620, "A Short Hike", 99, 18000, "¥920"]
].map(([appId, title, positivePercent, reviewCount, price]) => ({
  appId, title, positivePercent, reviewCount, price,
  steamUrl: `https://store.steampowered.com/app/${appId}/`,
  source: "fallback"
}));

function decodeHtml(value = "") {
  const entities = {
    "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " "
  };
  return value
    .replace(/&(?:amp|quot|#39|lt|gt|nbsp);/g, match => entities[match] || match)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"));
  return match?.[1] || "";
}

function classText(block, className) {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  return decodeHtml(block.match(pattern)?.[1] || "");
}

export function parseSearchResults(html) {
  const rows = html.match(/<a\b[^>]*class=["'][^"']*search_result_row[^"']*["'][\s\S]*?<\/a>/gi) || [];

  return rows.map(row => {
    const opening = row.match(/^<a\b[^>]*>/i)?.[0] || "";
    const idValue = attr(opening, "data-ds-appid");
    const appId = Number(idValue.match(/\d+/)?.[0]);
    const title = classText(row, "title");
    const reviewTag = row.match(/<span\b[^>]*class=["'][^"']*search_review_summary[^"']*["'][^>]*>/i)?.[0] || "";
    const tooltip = decodeHtml(attr(reviewTag, "data-tooltip-html"));
    const positivePercent = Number(tooltip.match(/(\d{1,3})%/)?.[1] || 0);
    const reviewText = tooltip.match(/(?:the\s+)?([\d,.]+)\s+(?:user\s+)?reviews?/i)?.[1] || "0";
    const reviewCount = Number(reviewText.replace(/[^\d]/g, ""));
    const price = classText(row, "discount_final_price") || classText(row, "search_price") || "価格情報なし";
    const href = decodeHtml(attr(opening, "href"));

    if (!appId || !title || !reviewCount || positivePercent < 95) return null;

    return {
      appId,
      title,
      positivePercent,
      reviewCount,
      price,
      steamUrl: href || `https://store.steampowered.com/app/${appId}/`,
      source: "steam"
    };
  }).filter(Boolean);
}

export function buildSteamUrl(start = 0) {
  const url = new URL("https://store.steampowered.com/search/results/");
  url.search = new URLSearchParams({
    query: "",
    start: String(start),
    count: String(PAGE_SIZE),
    dynamic_data: "",
    sort_by: "Reviews_DESC",
    review_score: "9",
    category1: "998",
    l: "english",
    cc: "JP",
    infinite: "1"
  }).toString();
  return url;
}

async function fetchSteamPage(start, signal) {
  const response = await fetch(buildSteamUrl(start), {
    signal,
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 Steam-Ranking/1.0"
    }
  });
  if (!response.ok) throw new Error(`Steam returned ${response.status}`);
  const payload = await response.json();
  return {
    games: parseSearchResults(payload.results_html || ""),
    totalCount: Number(payload.total_count || 0)
  };
}

async function loadGames(limit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEAM_TIMEOUT_MS);
  try {
    const wanted = Math.min(Math.max(limit, 25), 200);
    const first = await fetchSteamPage(0, controller.signal);
    const pageCount = Math.min(Math.ceil(Math.max(wanted, PAGE_SIZE) / PAGE_SIZE), 4);
    const remaining = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => fetchSteamPage((i + 1) * PAGE_SIZE, controller.signal))
    );
    const deduped = new Map();
    [first, ...remaining].flatMap(page => page.games).forEach(game => deduped.set(game.appId, game));
    const games = [...deduped.values()].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, wanted);
    if (!games.length) throw new Error("Steam results were empty");
    return { games, mode: "live", totalCount: first.totalCount };
  } finally {
    clearTimeout(timer);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, "http://localhost").pathname;
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const safePath = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(ROOT, safePath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/games") {
      const limit = Number(url.searchParams.get("limit") || 100);
      try {
        const result = await loadGames(limit);
        sendJson(res, 200, { ...result, fetchedAt: new Date().toISOString() });
      } catch (error) {
        sendJson(res, 200, {
          games: FALLBACK_GAMES.slice(0, limit),
          mode: "fallback",
          totalCount: FALLBACK_GAMES.length,
          fetchedAt: new Date().toISOString(),
          message: error?.name === "AbortError" ? "Steamへの接続がタイムアウトしました" : "Steamから取得できないため内蔵データを表示しています"
        });
      }
      return;
    }
    await serveStatic(req, res);
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  createServer().listen(PORT, "0.0.0.0", () => {
    console.log(`STEAM / OVW is running at http://localhost:${PORT}`);
  });
}
