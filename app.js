const DATA_URL = './games.json';
const PAGE_SIZE = 50;

const state = {
  games: [],
  currentPage: 1,
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
  pagination: document.querySelector('#pagination'),
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
    return { label: '最新データ', message: `最終取得：${success} ／ 全言語合算・95%以上・500件以上：${state.games.length}件`, status };
  }
  if (status === 'partial') {
    return { label: '一部取得', message: `${state.meta?.message || '走査上限に達したため結果が一部の可能性があります。'}（最終試行：${attempted}）`, status };
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
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const startIndex = (state.currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIndex, startIndex + PAGE_SIZE);
  elements.resultCount.textContent = formatNumber.format(filtered.length);
  elements.csvButton.disabled = filtered.length === 0;
  elements.emptyState.hidden = filtered.length !== 0;
  elements.rankingList.hidden = filtered.length === 0;
  renderEmpty(filtered);

  elements.rankingList.innerHTML = visible.map((game, index) => `
    <li class="rank-card" style="animation-delay:${Math.min(index, 12) * 25}ms">
      <span class="rank-number">${String(startIndex + index + 1).padStart(2, '0')}</span>
      <img class="game-image" src="${escapeHtml(game.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="game-info">
        <h3 class="game-title">${escapeHtml(game.name)}</h3>
        <p class="game-meta"><span class="rating-badge">${game.positivePercent}% 好評</span><span class="review-badge">全言語 ${formatNumber.format(game.totalReviews)}件</span><span>App ID: ${game.appId}</span></p>
      </div>
      <div class="review-data">
        <p class="review-total">${formatNumber.format(game.totalReviews)}</p>
        <p class="review-caption">TOTAL REVIEWS</p>
      </div>
      <a class="steam-link" href="${escapeHtml(game.storeUrl)}" target="_blank" rel="noopener noreferrer">STEAMで見る ↗</a>
    </li>`).join('');

  renderPagination(filtered.length, totalPages);
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) items.push('ellipsis-' + page);
    items.push(page);
  });
  return items;
}

function renderPagination(resultCount, totalPages) {
  if (resultCount === 0 || totalPages <= 1) {
    elements.pagination.hidden = true;
    elements.pagination.innerHTML = '';
    return;
  }
  elements.pagination.hidden = false;
  elements.pagination.innerHTML = paginationItems(state.currentPage, totalPages).map((item) => {
    if (typeof item === 'string') return '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
    const current = item === state.currentPage;
    return `<button type="button" data-page="${item}" aria-label="${item}ページ目" ${current ? 'aria-current="page"' : ''}>${item}</button>`;
  }).join('');
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
    state.currentPage = 1;
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
elements.searchInput.addEventListener('input', () => { state.currentPage = 1; render(); });
elements.minimumReviews.addEventListener('change', () => { state.currentPage = 1; render(); });
elements.sortOrder.addEventListener('change', () => { state.currentPage = 1; render(); });
elements.csvButton.addEventListener('click', exportCsv);
elements.pagination.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-page]');
  if (!button) return;
  state.currentPage = Number(button.dataset.page);
  render();
  document.querySelector('.ranking-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

loadData();
