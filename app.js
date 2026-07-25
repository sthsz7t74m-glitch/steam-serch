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
  clearSearchButton: document.querySelector('#clearSearchButton'),
  filterInputs: document.querySelectorAll('.filter-group .choice-input'),
  sortInputs: document.querySelectorAll('input[name="sortOrder"]'),
  sortTrigger: document.querySelector('#sortTrigger'),
  sortLabel: document.querySelector('#sortLabel'),
  sortDialog: document.querySelector('#sortDialog'),
  closeSortDialogButton: document.querySelector('#closeSortDialogButton'),
  resetFiltersButton: document.querySelector('#resetFiltersButton'),
  csvButton: document.querySelector('#csvButton'),
  filterResultCount: document.querySelector('#filterResultCount'),
  resultCount: document.querySelector('#resultCount'),
  rankingList: document.querySelector('#rankingList'),
  emptyState: document.querySelector('#emptyState'),
  emptyKicker: document.querySelector('#emptyKicker'),
  emptyTitle: document.querySelector('#emptyTitle'),
  emptyMessage: document.querySelector('#emptyMessage'),
  paginations: document.querySelectorAll('.pagination'),
};

const formatNumber = new Intl.NumberFormat('ja-JP');
const SORT_LABELS = {
  'reviews-desc': 'レビュー数：多い順',
  'reviews-asc': 'レビュー数：少ない順',
  'rating-desc': '好評率：高い順',
  'clear-time-asc': 'クリア時間：短い順',
  'clear-time-desc': 'クリア時間：長い順',
  'price-asc': '価格：安い順',
  'price-desc': '価格：高い順',
  'discount-desc': '割引率：高い順',
  'name-asc': 'ゲーム名：A–Z',
};

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function setSelectedValue(name, value) {
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = input.value === value;
  });
}

function syncControlDisplay() {
  const query = elements.searchInput.value.trim();
  elements.clearSearchButton.hidden = query.length === 0;
  elements.sortLabel.textContent = SORT_LABELS[selectedValue('sortOrder')] || SORT_LABELS['reviews-desc'];
  elements.resetFiltersButton.disabled = !query
    && selectedValue('minimumReviews') === '500'
    && selectedValue('changeFilter') === 'all'
    && selectedValue('saleFilter') === 'all'
    && selectedValue('sortOrder') === 'reviews-desc';
}

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

function rankChangeCategory(game) {
  if (game.previousRank == null || game.rankChange == null) return 'new';
  if (game.rankChange > 0) return 'up';
  if (game.rankChange < 0) return 'down';
  return 'same';
}

function clearTimeValue(game) {
  const hours = Number(game.clearTimeHours);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function formatClearTime(game) {
  const hours = clearTimeValue(game);
  if (hours == null) return 'クリア時間目安：不明';
  const display = hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return `クリア時間目安：約${display}時間`;
}

function compareClearTime(a, b, direction) {
  const aHours = clearTimeValue(a);
  const bHours = clearTimeValue(b);
  if (aHours == null && bHours == null) return b.totalReviews - a.totalReviews;
  if (aHours == null) return 1;
  if (bHours == null) return -1;
  return direction * (aHours - bHours) || b.totalReviews - a.totalReviews;
}

function priceValue(game) {
  if (game.priceYen == null || game.priceYen === '') return null;
  const price = Number(game.priceYen);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function originalPriceValue(game) {
  if (game.originalPriceYen == null || game.originalPriceYen === '') return null;
  const price = Number(game.originalPriceYen);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function isOnSale(game) {
  return game.isOnSale === true || Number(game.discountPercent) > 0;
}

function comparePrice(a, b, direction) {
  const aPrice = priceValue(a);
  const bPrice = priceValue(b);
  if (aPrice == null && bPrice == null) return b.totalReviews - a.totalReviews;
  if (aPrice == null) return 1;
  if (bPrice == null) return -1;
  return direction * (aPrice - bPrice) || b.totalReviews - a.totalReviews;
}

function priceMarkup(game) {
  const price = priceValue(game);
  if (price == null) {
    return '<div class="price-block price-unknown"><span class="price-label">PRICE</span><strong>価格不明</strong></div>';
  }
  if (game.isFree === true && !isOnSale(game)) {
    return '<div class="price-block price-free"><span class="price-label">PRICE</span><strong>無料</strong></div>';
  }

  const discount = Math.max(0, Number(game.discountPercent) || 0);
  const original = originalPriceValue(game);
  const originalMarkup = isOnSale(game) && original !== null && original > price
    ? `<s>¥${formatNumber.format(original)}</s>`
    : '';
  const discountMarkup = isOnSale(game) && discount > 0
    ? `<span class="discount-badge">-${discount}%</span>`
    : '';
  return `<div class="price-block${isOnSale(game) ? ' price-sale' : ''}"><span class="price-label">PRICE</span><div class="price-line">${discountMarkup}<strong>¥${formatNumber.format(price)}</strong>${originalMarkup}</div></div>`;
}

function filteredGames() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase('ja');
  const minimum = Number(selectedValue('minimumReviews'));
  const selectedChange = selectedValue('changeFilter');
  const selectedSale = selectedValue('saleFilter');
  const games = state.games.filter((game) => {
    const matchesName = !query || game.name.toLocaleLowerCase('ja').includes(query);
    const matchesChange = selectedChange === 'all' || rankChangeCategory(game) === selectedChange;
    const matchesSale = selectedSale === 'all'
      || (selectedSale === 'sale' && isOnSale(game))
      || (selectedSale === 'free' && game.isFree === true);
    return matchesName && matchesChange && matchesSale && game.totalReviews >= minimum;
  });

  return games.sort((a, b) => {
    switch (selectedValue('sortOrder')) {
      case 'reviews-asc': return a.totalReviews - b.totalReviews;
      case 'rating-desc': return b.positivePercent - a.positivePercent || b.totalReviews - a.totalReviews;
      case 'clear-time-asc': return compareClearTime(a, b, 1);
      case 'clear-time-desc': return compareClearTime(a, b, -1);
      case 'price-asc': return comparePrice(a, b, 1);
      case 'price-desc': return comparePrice(a, b, -1);
      case 'discount-desc': return (Number(b.discountPercent) || 0) - (Number(a.discountPercent) || 0) || b.totalReviews - a.totalReviews;
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
    elements.emptyMessage.textContent = '検索語・レビュー数・順位変動・セール条件を変更してください。';
  }
}

function rankChangeMarkup(game) {
  if (game.previousRank == null || game.rankChange == null) {
    return '<span class="rank-change rank-new">NEW</span>';
  }
  if (game.rankChange > 0) {
    return `<span class="rank-change rank-up" aria-label="前日比${game.rankChange}ランク上昇">↑${game.rankChange}</span>`;
  }
  if (game.rankChange < 0) {
    return `<span class="rank-change rank-down" aria-label="前日比${Math.abs(game.rankChange)}ランク下降">↓${Math.abs(game.rankChange)}</span>`;
  }
  return '<span class="rank-change rank-same" aria-label="前日比変動なし">–</span>';
}

function originalRank(game) {
  return game.originalRank ?? state.games.indexOf(game) + 1;
}

function render() {
  const filtered = filteredGames();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const startIndex = (state.currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(startIndex, startIndex + PAGE_SIZE);
  elements.resultCount.textContent = formatNumber.format(filtered.length);
  elements.filterResultCount.textContent = formatNumber.format(filtered.length);
  elements.csvButton.disabled = filtered.length === 0;
  elements.emptyState.hidden = filtered.length !== 0;
  elements.rankingList.hidden = filtered.length === 0;
  syncControlDisplay();
  renderEmpty(filtered);

  elements.rankingList.innerHTML = visible.map((game, index) => {
    const rank = originalRank(game);
    return `
    <li class="rank-card" data-rank="${rank}" style="animation-delay:${Math.min(index, 12) * 25}ms">
      <div class="rank-position"><span class="rank-number">${String(rank).padStart(2, '0')}</span>${rankChangeMarkup(game)}</div>
      <img class="game-image" src="${escapeHtml(game.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="game-info">
        <h3 class="game-title">${escapeHtml(game.name)}</h3>
        ${priceMarkup(game)}
        <p class="game-meta"><span class="rating-badge">${game.positivePercent}% 好評</span><span class="review-badge">全言語 ${formatNumber.format(game.totalReviews)}件</span><span class="clear-time-badge" title="Steamレビュー投稿時のプレイ時間中央値を基にした目安">${formatClearTime(game)}</span><span>App ID: ${game.appId}</span></p>
      </div>
      <div class="review-data">
        <p class="review-total">${formatNumber.format(game.totalReviews)}</p>
        <p class="review-caption">TOTAL REVIEWS</p>
      </div>
      <a class="steam-link" href="${escapeHtml(game.storeUrl)}" target="_blank" rel="noopener noreferrer">STEAMで見る ↗</a>
    </li>`;
  }).join('');

  renderPagination(filtered.length, totalPages);
}

function paginationItems(currentPage, totalPages) {
  const PAGE_RANGE = 4;
  if (totalPages <= PAGE_RANGE * 2 + 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);
  const rangeStart = Math.max(2, currentPage - PAGE_RANGE);
  const rangeEnd = Math.min(totalPages - 1, currentPage + PAGE_RANGE);
  for (let page = rangeStart; page <= rangeEnd; page += 1) pages.add(page);

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) items.push('ellipsis-' + page);
    items.push(page);
  });
  return items;
}

function renderPagination(resultCount, totalPages) {
  const hidden = resultCount === 0 || totalPages <= 1;
  const markup = hidden ? '' : paginationItems(state.currentPage, totalPages).map((item) => {
    if (typeof item === 'string') return '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
    const current = item === state.currentPage;
    return `<button type="button" data-page="${item}" aria-label="${item}ページ目" ${current ? 'aria-current="page"' : ''}>${item}</button>`;
  }).join('');

  elements.paginations.forEach((pagination) => {
    pagination.hidden = hidden;
    pagination.innerHTML = markup;
  });
}

async function loadData() {
  elements.reloadButton.disabled = true;
  elements.reloadButton.textContent = '読込中…';
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.games)) throw new Error('データ形式が正しくありません');
    state.games = data.games.map((game, index) => ({ ...game, originalRank: index + 1 }));
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
  const rows = [['順位', 'ゲーム名', 'App ID', '好評率', '通算レビュー数', 'クリア時間目安（時間）', '現在価格（円）', '通常価格（円）', '割引率', 'セール中', '順位変動', 'Steam URL']];
  filteredGames().forEach((game) => rows.push([
    originalRank(game),
    game.name,
    game.appId,
    `${game.positivePercent}%`,
    game.totalReviews,
    clearTimeValue(game) ?? '不明',
    priceValue(game) ?? '不明',
    originalPriceValue(game) ?? '',
    `${Number(game.discountPercent) || 0}%`,
    isOnSale(game) ? 'はい' : 'いいえ',
    rankChangeCategory(game),
    game.storeUrl,
  ]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'steam-overwhelming-ranking.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function resetFilters() {
  elements.searchInput.value = '';
  setSelectedValue('minimumReviews', '500');
  setSelectedValue('changeFilter', 'all');
  setSelectedValue('saleFilter', 'all');
  setSelectedValue('sortOrder', 'reviews-desc');
  state.currentPage = 1;
  render();
}

function openSortDialog() {
  if (typeof elements.sortDialog.showModal === 'function') {
    elements.sortDialog.showModal();
  } else {
    elements.sortDialog.setAttribute('open', '');
  }
}

function closeSortDialog() {
  if (typeof elements.sortDialog.close === 'function') {
    elements.sortDialog.close();
  } else {
    elements.sortDialog.removeAttribute('open');
  }
}

elements.reloadButton.addEventListener('click', loadData);
elements.searchInput.addEventListener('input', () => { state.currentPage = 1; render(); });
elements.clearSearchButton.addEventListener('click', () => {
  elements.searchInput.value = '';
  state.currentPage = 1;
  render();
  elements.searchInput.focus();
});
elements.filterInputs.forEach((input) => {
  input.addEventListener('change', () => { state.currentPage = 1; render(); });
});
elements.sortInputs.forEach((input) => {
  input.addEventListener('change', () => {
    state.currentPage = 1;
    render();
    closeSortDialog();
  });
});
elements.sortTrigger.addEventListener('click', openSortDialog);
elements.closeSortDialogButton.addEventListener('click', closeSortDialog);
elements.sortDialog.addEventListener('click', (event) => {
  if (event.target === elements.sortDialog) closeSortDialog();
});
elements.resetFiltersButton.addEventListener('click', resetFilters);
elements.csvButton.addEventListener('click', exportCsv);
elements.paginations.forEach((pagination) => {
  pagination.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    state.currentPage = Number(button.dataset.page);
    render();
    document.querySelector('.ranking-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

loadData();
