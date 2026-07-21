const DATA_URL = './games.json';
const PAGE_SIZE = 30;

const state = {
  games: [],
  visibleCount: PAGE_SIZE,
  meta: null,
};

const elements = {
  statusPanel: document.querySelector('#statusPanel'),
  statusLabel: document.querySelector('#statusLabel'),
  statusMessage: document.querySelector('#statusMessage'),
  reloadButton: document.querySelector('#reloadButton'),
  searchInput: document.querySelector('#searchInput'),
  minimumReviews: document.querySelector('#minimumReviews'),
  sortOrder: document.querySelector('#sortOrder'),
  csvButton: document.querySelector('#csvButton'),
  resultCount: document.querySelector('#resultCount'),
  rankingList: document.querySelector('#rankingList'),
  emptyState: document.querySelector('#emptyState'),
  emptyKicker: document.querySelector('#emptyKicker'),
  emptyTitle: document.querySelector('#emptyTitle'),
  emptyMessage: document.querySelector('#emptyMessage'),
  loadMoreButton: document.querySelector('#loadMoreButton'),
};

const formatNumber = new Intl.NumberFormat('ja-JP');

function formatDate(value) {
  if (!value) return '不明';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '不明';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function filteredGames() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase('ja');
  const minimum = Number(elements.minimumReviews.value);
  const games = state.games.filter((game) => {
    const matchesName = !query || game.name.toLocaleLowerCase('ja').includes(query);
    return matchesName && game.totalReviews >= minimum;
  });

  return games.sort((a, b) => {
    switch (elements.sortOrder.value) {
      case 'reviews-asc': return a.totalReviews - b.totalReviews;
      case 'rating-desc': return b.positivePercent - a.positivePercent || b.totalReviews - a.totalReviews;
      case 'name-asc': return a.name.localeCompare(b.name, 'ja');
      default: return b.totalReviews - a.totalReviews;
    }
  });
}

function statusContent() {
  const status = state.meta?.status || 'error';
  const attempted = formatDate(state.meta?.attemptedAt);
  const success = formatDate(state.meta?.lastSuccessfulAt);
  if (status === 'success') {
    return { label: '最新データ', message: `最終取得：${success} ／ Steamから${state.games.length}件を取得`, status };
  }
  if (status === 'partial') {
    return { label: '一部取得', message: `${state.meta?.message || '取得上限までに200件へ到達しませんでした。'}（最終試行：${attempted}）`, status };
  }
  if (status === 'stale') {
    return { label: '前回取得データ', message: `最新の取得に失敗しました。表示中データ：${success} ／ 最終試行：${attempted}`, status };
  }
  return { label: '取得失敗', message: `${state.meta?.message || 'Steamデータを取得できませんでした。'}（最終試行：${attempted}）`, status: 'error' };
}

function renderStatus() {
  const content = statusContent();
  elements.statusPanel.dataset.status = content.status;
  elements.statusLabel.textContent = content.label;
  elements.statusMessage.textContent = content.message;
}

function renderEmpty(filtered) {
  if (state.games.length === 0) {
    elements.emptyKicker.textContent = 'FETCH FAILED';
    elements.emptyTitle.textContent = 'データを取得できませんでした';
    elements.emptyMessage.textContent = state.meta?.message || 'GitHub Actionsの実行結果を確認してください。';
  } else if (filtered.length === 0) {
    elements.emptyKicker.textContent = 'NO MATCH';
    elements.emptyTitle.textContent = '条件に合うゲームがありません';
    elements.emptyMessage.textContent = '検索語または最低レビュー数を変更してください。';
  }
}

function render() {
  const filtered = filteredGames();
  const visible = filtered.slice(0, state.visibleCount);
  elements.resultCount.textContent = formatNumber.format(filtered.length);
  elements.csvButton.disabled = filtered.length === 0;
  elements.emptyState.hidden = filtered.length !== 0;
  elements.rankingList.hidden = filtered.length === 0;
  renderEmpty(filtered);

  elements.rankingList.innerHTML = visible.map((game, index) => `
    <li class="rank-card" style="animation-delay:${Math.min(index, 12) * 25}ms">
      <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
      <img class="game-image" src="${escapeHtml(game.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="game-info">
        <h3 class="game-title">${escapeHtml(game.name)}</h3>
        <p class="game-meta"><span>圧倒的に好評</span><span>${game.positivePercent}% が好評</span><span>App ID: ${game.appId}</span></p>
      </div>
      <div class="review-data">
        <p class="review-total">${formatNumber.format(game.totalReviews)}</p>
        <p class="review-caption">TOTAL REVIEWS</p>
      </div>
      <a class="steam-link" href="${escapeHtml(game.storeUrl)}" target="_blank" rel="noopener noreferrer">STEAMで見る ↗</a>
    </li>`).join('');

  elements.loadMoreButton.hidden = visible.length >= filtered.length || filtered.length === 0;
}

async function loadData() {
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = '読込中…';
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.games)) throw new Error('データ形式が正しくありません');
    state.games = data.games;
    state.meta = data.meta || { status: 'error', message: '取得状況が記録されていません。' };
  } catch (error) {
    state.games = [];
    state.meta = { status: 'error', attemptedAt: new Date().toISOString(), message: `ランキングファイルを読み込めませんでした：${error.message}` };
  } finally {
    state.visibleCount = PAGE_SIZE;
    renderStatus();
    render();
    elements.reloadButton.disabled = false;
    elements.reloadButton.textContent = '再読込';
  }
}

function exportCsv() {
  const rows = [['順位', 'ゲーム名', 'App ID', '好評率', '通算レビュー数', 'Steam URL']];
  filteredGames().forEach((game, index) => rows.push([index + 1, game.name, game.appId, `${game.positivePercent}%`, game.totalReviews, game.storeUrl]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'steam-overwhelming-ranking.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

elements.reloadButton.addEventListener('click', loadData);
elements.searchInput.addEventListener('input', () => { state.visibleCount = PAGE_SIZE; render(); });
elements.minimumReviews.addEventListener('change', () => { state.visibleCount = PAGE_SIZE; render(); });
elements.sortOrder.addEventListener('change', () => { state.visibleCount = PAGE_SIZE; render(); });
elements.csvButton.addEventListener('click', exportCsv);
elements.loadMoreButton.addEventListener('click', () => { state.visibleCount += PAGE_SIZE; render(); });

loadData();
