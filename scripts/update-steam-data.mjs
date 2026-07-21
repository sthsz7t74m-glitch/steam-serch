import { readFile, writeFile } from 'node:fs/promises';
import { failedData, isOverwhelminglyPositive, parseSearchResults, rankGames, toGame } from './steam-data.mjs';

const OUTPUT_PATH = new URL('../games.json', import.meta.url);
const LIMIT = Number(process.env.RANKING_LIMIT || 200);
const PAGE_SIZE = Number(process.env.STEAM_PAGE_SIZE || 50);
const MAX_PAGES = Number(process.env.STEAM_MAX_PAGES || 100);
const CONCURRENCY = Number(process.env.STEAM_CONCURRENCY || 8);
const REQUEST_TIMEOUT_MS = Number(process.env.STEAM_TIMEOUT_MS || 25000);
const SEARCH_BASE = process.env.STEAM_SEARCH_BASE || 'https://store.steampowered.com/search/results/';
const REVIEWS_BASE = process.env.STEAM_REVIEWS_BASE || 'https://store.steampowered.com/appreviews/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SteamOverwhelmingRanking/2.0; +https://github.com/)',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'birthtime=0; lastagecheckage=1-January-1970; mature_content=1; wants_mature_content=1',
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchJson(url, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

async function fetchSearchPage(start) {
  const url = new URL(SEARCH_BASE);
  url.searchParams.set('query', '');
  url.searchParams.set('start', String(start));
  url.searchParams.set('count', String(PAGE_SIZE));
  url.searchParams.set('dynamic_data', '');
  url.searchParams.set('sort_by', 'Reviews_DESC');
  url.searchParams.set('category1', '998');
  url.searchParams.set('infinite', '1');
  url.searchParams.set('cc', 'us');
  url.searchParams.set('l', 'english');
  const data = await fetchJson(url);
  if (typeof data.results_html !== 'string') throw new Error('Steam検索の応答形式が変わりました。');
  return { items: parseSearchResults(data.results_html), totalCount: Number(data.total_count) || null };
}

async function fetchReviewSummary(appId) {
  const url = new URL(String(appId), REVIEWS_BASE);
  url.searchParams.set('json', '1');
  url.searchParams.set('filter', 'all');
  url.searchParams.set('language', 'all');
  url.searchParams.set('day_range', '9223372036854775807');
  url.searchParams.set('review_type', 'all');
  url.searchParams.set('purchase_type', 'all');
  url.searchParams.set('num_per_page', '0');
  const data = await fetchJson(url);
  if (!data.success || !data.query_summary) throw new Error(`App ID ${appId} の評価を取得できませんでした。`);
  return data.query_summary;
}

async function mapConcurrent(items, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
      await sleep(100);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return results;
}

async function readPrevious() {
  try { return JSON.parse(await readFile(OUTPUT_PATH, 'utf8')); }
  catch { return { meta: {}, games: [] }; }
}

async function main() {
  const attemptedAt = new Date().toISOString();
  const previous = await readPrevious();
  const matches = [];
  const checked = new Set();
  let scanned = 0;
  let totalAvailable = null;
  let exhausted = false;

  try {
    for (let page = 0; page < MAX_PAGES && matches.length < LIMIT; page += 1) {
      const start = page * PAGE_SIZE;
      const { items, totalCount } = await fetchSearchPage(start);
      if (totalCount) totalAvailable = totalCount;
      if (items.length === 0) {
        if (totalAvailable !== null && start < totalAvailable) throw new Error('Steam検索結果を解析できませんでした。サイト構造が変わった可能性があります。');
        exhausted = true;
        break;
      }

      scanned += items.length;
      const candidates = items.filter((item) => {
        if (checked.has(item.appId)) return false;
        checked.add(item.appId);
        return item.percent >= 95 && item.searchReviewCount >= 500;
      });

      const reviewed = await mapConcurrent(candidates, async (item) => {
        try {
          const summary = await fetchReviewSummary(item.appId);
          return isOverwhelminglyPositive(summary) ? toGame(item, summary) : null;
        } catch (error) {
          console.warn(error.message);
          return null;
        }
      });
      matches.push(...reviewed.filter(Boolean));

      if (totalAvailable !== null && start + items.length >= totalAvailable) {
        exhausted = true;
        break;
      }
      await sleep(350);
    }

    const games = rankGames(matches, LIMIT);
    if (games.length === 0) throw new Error('「圧倒的に好評」のゲームを1件も取得できませんでした。');
    const complete = games.length >= LIMIT || exhausted;
    const message = complete
      ? `${scanned}件を確認し、条件に合う${games.length}件を取得しました。`
      : `${scanned}件を確認しましたが、走査上限までに${LIMIT}件へ到達しませんでした。`;
    const output = {
      meta: {
        status: complete ? 'success' : 'partial',
        attemptedAt,
        lastSuccessfulAt: attemptedAt,
        message,
        source: 'Steam Store',
        scanned,
        count: games.length,
        limit: LIMIT,
        totalAvailable,
        rankingDefinition: 'Steamの通算評価がOverwhelmingly Positive（review_score=9）のゲームを通算レビュー数の多い順に最大200件',
      },
      games,
    };
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
    console.log(message);
  } catch (error) {
    const message = `Steamデータを取得できませんでした：${error.message}`;
    await writeFile(OUTPUT_PATH, `${JSON.stringify(failedData(previous, attemptedAt, message), null, 2)}\n`);
    console.error(message);
  }
}

await main();
