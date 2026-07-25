import test from 'node:test';
import assert from 'node:assert/strict';
import { failedData, isOverwhelminglyPositive, parseSearchResults, parseYenPrice, rankGames, toGame } from '../scripts/steam-data.mjs';

const fixture = `
<a href="https://store.steampowered.com/app/620/Portal_2/" data-ds-appid="620" class="search_result_row ds_collapse_flag">
  <div><img src="https://cdn.example/620.jpg"></div>
  <span class="title">Portal 2 &amp; Friends</span>
  <span class="search_review_summary positive" data-tooltip-html="98% of the 400,123 user reviews for this game are positive."></span>
  <div class="discount_block search_discount_block" data-price-final="120000">
    <div class="discount_pct">-60%</div>
    <div class="discount_prices">
      <div class="discount_original_price">&yen; 3,000</div>
      <div class="discount_final_price">¥ 1,200</div>
    </div>
  </div>
</a>`;

test('Steam検索HTMLからゲーム情報を抽出する', () => {
  assert.deepEqual(parseSearchResults(fixture), [{
    appId: 620,
    name: 'Portal 2 & Friends',
    imageUrl: 'https://cdn.example/620.jpg',
    percent: 98,
    searchReviewCount: 400123,
    priceYen: 1200,
    originalPriceYen: 3000,
    discountPercent: 60,
    isOnSale: true,
    isFree: false,
  }]);
});

test('日本円価格・無料・価格不明を判定する', () => {
  assert.equal(parseYenPrice('¥ 1,980'), 1980);
  assert.equal(parseYenPrice('&yen; 980'), 980);
  assert.equal(parseYenPrice('Free To Play'), 0);
  assert.equal(parseYenPrice('無料プレイ'), 0);
  assert.equal(parseYenPrice('Coming Soon'), null);
  assert.equal(parseYenPrice('Available in 2026'), null);
  assert.equal(parseYenPrice('￥１，９８０'), 1980);
});

test('無料ゲームと通常価格ゲームの検索HTMLを判定する', () => {
  const rows = parseSearchResults(`
    <a href="/app/1/" data-ds-appid="1" class="search_result_row">
      <span class="title">Free Game</span>
      <span data-tooltip-html="96% of the 1,000 user reviews for this game are positive."></span>
      <div class="discount_final_price free">Free To Play</div>
    </a>
    <a href="/app/2/" data-ds-appid="2" class="search_result_row">
      <span class="title">Paid Game</span>
      <span data-tooltip-html="97% of the 2,000 user reviews for this game are positive."></span>
      <div class="discount_final_price">¥ 980</div>
    </a>
    <a href="/app/5/" data-ds-appid="5" data-discount="100" class="search_result_row">
      <span class="title">Free This Weekend</span>
      <span data-tooltip-html="98% of the 3,000 user reviews for this game are positive."></span>
      <div class="discount_original_price">¥ 1,500</div>
      <div class="discount_final_price">無料</div>
    </a>
  `);
  assert.deepEqual(rows.map(({ priceYen, isOnSale, isFree }) => ({ priceYen, isOnSale, isFree })), [
    { priceYen: 0, isOnSale: false, isFree: true },
    { priceYen: 980, isOnSale: false, isFree: false },
    { priceYen: 0, isOnSale: true, isFree: false },
  ]);
});

test('data-price-finalと旧形式HTMLから価格を取得する', () => {
  const rows = parseSearchResults(`
    <a href="/app/3/" data-ds-appid="3" data-price-final="148000" class="search_result_row">
      <span class="title">Attribute Price</span>
      <span data-tooltip-html="96% of the 1,000 user reviews for this game are positive."></span>
    </a>
    <a href="/app/4/" data-ds-appid="4" class="search_result_row">
      <span class="title">Legacy Sale</span>
      <span data-tooltip-html="97% of the 2,000 user reviews for this game are positive."></span>
      <div class="search_discount"><span>-50%</span></div>
      <div class="search_price discounted"><span><strike>¥ 2,000</strike></span><br>¥ 1,000</div>
    </a>
  `);
  assert.deepEqual(rows.map(({ priceYen, originalPriceYen, discountPercent, isOnSale }) => ({
    priceYen, originalPriceYen, discountPercent, isOnSale,
  })), [
    { priceYen: 1480, originalPriceYen: null, discountPercent: 0, isOnSale: false },
    { priceYen: 1000, originalPriceYen: 2000, discountPercent: 50, isOnSale: true },
  ]);
});

test('全言語合算で好評率95%以上かつ500件以上を圧倒的好評と判定する', () => {
  assert.equal(isOverwhelminglyPositive({ total_positive: 475, total_negative: 25, total_reviews: 500 }), true);
  assert.equal(isOverwhelminglyPositive({ total_positive: 474, total_negative: 26, total_reviews: 500 }), false);
  assert.equal(isOverwhelminglyPositive({ total_positive: 474, total_negative: 25, total_reviews: 499 }), false);
  assert.equal(isOverwhelminglyPositive({ review_score: 8, total_positive: 950, total_negative: 50, total_reviews: 1000 }), true);
});

test('レビュー件数順に並べ、App ID重複を除外する', () => {
  const ranked = rankGames([
    { appId: 1, name: 'A', totalReviews: 100 },
    { appId: 2, name: 'B', totalReviews: 300 },
    { appId: 1, name: 'A', totalReviews: 200 },
  ]);
  assert.deepEqual(ranked.map((game) => [game.appId, game.totalReviews]), [[2, 300], [1, 200]]);
});

test('評価集計から価格を含む表示用ゲームを生成する', () => {
  const game = toGame({
    appId: 10,
    name: 'Game',
    imageUrl: '',
    priceYen: 1200,
    originalPriceYen: 3000,
    discountPercent: 60,
    isOnSale: true,
    isFree: false,
  }, {
    review_score: 9, review_score_desc: 'Overwhelmingly Positive', total_positive: 950, total_negative: 50, total_reviews: 1000,
  });
  assert.equal(game.positivePercent, 95);
  assert.equal(game.totalReviews, 1000);
  assert.equal(game.priceYen, 1200);
  assert.equal(game.originalPriceYen, 3000);
  assert.equal(game.discountPercent, 60);
  assert.equal(game.isOnSale, true);
  assert.match(game.storeUrl, /\/app\/10\//);
});

test('初回取得失敗時はダミーデータを入れない', () => {
  const result = failedData({ meta: {}, games: [] }, '2026-07-21T00:00:00.000Z', '取得失敗');
  assert.equal(result.meta.status, 'error');
  assert.deepEqual(result.games, []);
});

test('更新失敗時は前回成功データだけをstaleとして維持する', () => {
  const previous = { meta: { lastSuccessfulAt: '2026-07-20T00:00:00.000Z' }, games: [{ appId: 1 }] };
  const result = failedData(previous, '2026-07-21T00:00:00.000Z', '取得失敗');
  assert.equal(result.meta.status, 'stale');
  assert.equal(result.games.length, 1);
});
