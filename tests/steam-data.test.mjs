import test from 'node:test';
import assert from 'node:assert/strict';
import { failedData, isOverwhelminglyPositive, parseSearchResults, rankGames, toGame } from '../scripts/steam-data.mjs';

const fixture = `
<a href="https://store.steampowered.com/app/620/Portal_2/" data-ds-appid="620" class="search_result_row ds_collapse_flag">
  <div><img src="https://cdn.example/620.jpg"></div>
  <span class="title">Portal 2 &amp; Friends</span>
  <span class="search_review_summary positive" data-tooltip-html="98% of the 400,123 user reviews for this game are positive."></span>
</a>`;

test('Steam検索HTMLからゲーム情報を抽出する', () => {
  assert.deepEqual(parseSearchResults(fixture), [{
    appId: 620,
    name: 'Portal 2 & Friends',
    imageUrl: 'https://cdn.example/620.jpg',
    percent: 98,
    searchReviewCount: 400123,
  }]);
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

test('評価集計から表示用ゲームを生成する', () => {
  const game = toGame({ appId: 10, name: 'Game', imageUrl: '' }, {
    review_score: 9, review_score_desc: 'Overwhelmingly Positive', total_positive: 950, total_negative: 50, total_reviews: 1000,
  });
  assert.equal(game.positivePercent, 95);
  assert.equal(game.totalReviews, 1000);
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
