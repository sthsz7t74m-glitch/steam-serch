import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const OUTPUT = resolve(ROOT, "games.json");
const PAGE_SIZE = 50;
const MAX_PAGES = 4;

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
    const appId = Number(attr(opening, "data-ds-appid").match(/\d+/)?.[0]);
    const title = classText(row, "title");
    const reviewTag = row.match(/<span\b[^>]*class=["'][^"']*search_review_summary[^"']*["'][^>]*>/i)?.[0] || "";
    const tooltip = decodeHtml(attr(reviewTag, "data-tooltip-html"));
    const positivePercent = Number(tooltip.match(/(\d{1,3})%/)?.[1] || 0);
    const reviewText = tooltip.match(/(?:the\s+)?([\d,.]+)\s+(?:user\s+)?reviews?/i)?.[1] || "0";
    const reviewCount = Number(reviewText.replace(/[^\d]/g, ""));
    const price = classText(row, "discount_final_price") || classText(row, "search_price") || "価格情報なし";
    const steamUrl = decodeHtml(attr(opening, "href")) || `https://store.steampowered.com/app/${appId}/`;

    if (!appId || !title || !reviewCount || positivePercent < 95) return null;
    return { appId, title, positivePercent, reviewCount, price, steamUrl };
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

async function fetchPage(start) {
  const response = await fetch(buildSteamUrl(start), {
    headers: {
      accept: "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 GitHub-Actions-Steam-Ranking/1.1"
    }
  });
  if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}`);
  const payload = await response.json();
  return parseSearchResults(payload.results_html || "");
}

export async function updateData() {
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, index) => fetchPage(index * PAGE_SIZE))
  );
  const deduped = new Map();
  pages.flat().forEach(game => deduped.set(game.appId, game));
  const games = [...deduped.values()].sort((a, b) => b.reviewCount - a.reviewCount);
  if (games.length < 10) throw new Error(`取得件数が少なすぎます: ${games.length}`);

  const current = JSON.parse(await readFile(OUTPUT, "utf8"));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "steam",
    count: games.length,
    games
  };
  if (JSON.stringify(current.games) === JSON.stringify(payload.games) && current.source === "steam") {
    console.log(`No ranking changes (${games.length} games)`);
    return false;
  }

  await writeFile(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Updated games.json (${games.length} games)`);
  return true;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  updateData().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
