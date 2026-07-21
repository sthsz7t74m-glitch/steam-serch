import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildSteamUrl, parseSearchResults } from "../scripts/update-data.mjs";

test("Steam検索HTMLから高評価率とレビュー数を抽出する", () => {
  const html = `
    <a href="https://store.steampowered.com/app/413150/Stardew_Valley/" class="search_result_row ds_collapse_flag" data-ds-appid="413150">
      <span class="title">Stardew Valley</span>
      <span class="search_review_summary positive" data-tooltip-html="Overwhelmingly Positive&lt;br&gt;98% of the 812,345 user reviews for this game are positive."></span>
      <div class="discount_final_price">¥1,480</div>
    </a>`;
  const [game] = parseSearchResults(html);
  assert.equal(game.appId, 413150);
  assert.equal(game.title, "Stardew Valley");
  assert.equal(game.positivePercent, 98);
  assert.equal(game.reviewCount, 812345);
  assert.equal(game.price, "¥1,480");
});

test("95%未満のゲームは除外する", () => {
  const html = `
    <a href="https://store.steampowered.com/app/1/Test/" class="search_result_row" data-ds-appid="1">
      <span class="title">Test</span>
      <span class="search_review_summary positive" data-tooltip-html="Very Positive&lt;br&gt;94% of the 10,000 user reviews are positive."></span>
    </a>`;
  assert.deepEqual(parseSearchResults(html), []);
});

test("Steam検索条件が圧倒的に好評・レビュー数順になっている", () => {
  const url = buildSteamUrl(50);
  assert.equal(url.searchParams.get("review_score"), "9");
  assert.equal(url.searchParams.get("sort_by"), "Reviews_DESC");
  assert.equal(url.searchParams.get("start"), "50");
});

test("GitHub Pages用の静的ファイルだけでデータを読み込める", async () => {
  const root = resolve(import.meta.dirname, "..");
  const [html, app, dataText] = await Promise.all([
    readFile(resolve(root, "index.html"), "utf8"),
    readFile(resolve(root, "app.js"), "utf8"),
    readFile(resolve(root, "games.json"), "utf8")
  ]);
  const data = JSON.parse(dataText);
  assert.match(html, /app\.js/);
  assert.match(app, /\.\/games\.json/);
  assert.doesNotMatch(app, /\/api\/games/);
  assert.ok(data.games.length >= 10);
  assert.ok(data.games.every(game => game.positivePercent >= 95));
});
