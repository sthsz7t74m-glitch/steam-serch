const state = {
  allGames: [],
  games: [],
  visible: [],
  source: "loading",
  fetchedAt: null
};

const $ = selector => document.querySelector(selector);
const gameList = $("#gameList");
const emptyState = $("#emptyState");
const resultCount = $("#resultCount");
const sourceLabel = $("#sourceLabel");
const sourceMeta = sourceLabel.closest(".topbar-meta");
const reloadButton = $("#reloadButton");

const formatter = new Intl.NumberFormat("ja-JP");

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[character]);
}

function showSkeletons() {
  gameList.setAttribute("aria-busy", "true");
  gameList.innerHTML = Array.from({ length: 6 }, () => '<div class="game-row skeleton" aria-hidden="true"></div>').join("");
}

function applyFilters() {
  const query = $("#searchInput").value.trim().toLocaleLowerCase("ja");
  const minimum = Number($("#minimumSelect").value);
  const sort = $("#sortSelect").value;
  const limit = Number($("#limitSelect").value);

  state.games = state.allGames.slice(0, limit);

  state.visible = state.games.filter(game =>
    game.reviewCount >= minimum && game.title.toLocaleLowerCase("ja").includes(query)
  );

  state.visible.sort((a, b) => {
    if (sort === "score") return b.positivePercent - a.positivePercent || b.reviewCount - a.reviewCount;
    if (sort === "name") return a.title.localeCompare(b.title, "ja");
    return b.reviewCount - a.reviewCount;
  });

  render();
}

function render() {
  gameList.setAttribute("aria-busy", "false");
  resultCount.textContent = formatter.format(state.visible.length);
  emptyState.hidden = state.visible.length > 0;

  gameList.innerHTML = state.visible.map((game, index) => `
    <a class="game-row" href="${escapeHtml(game.steamUrl)}" target="_blank" rel="noopener noreferrer">
      <span class="game-title">
        <span class="rank-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="title-block">
          <strong>${escapeHtml(game.title)}</strong>
          <small>APP ID / ${game.appId}</small>
        </span>
      </span>
      <span class="metric score"><strong>${game.positivePercent}%</strong><small>高評価率</small></span>
      <span class="metric reviews"><strong>${formatter.format(game.reviewCount)}</strong><small>レビュー</small></span>
      <span class="metric price"><strong>${escapeHtml(game.price || "—")}</strong><small>価格</small></span>
      <span class="arrow" aria-hidden="true">↗</span>
    </a>
  `).join("");
}

function updateSourceLabel(message) {
  sourceMeta.classList.toggle("is-fallback", state.source !== "steam");
  if (message) {
    sourceLabel.textContent = message;
    return;
  }
  const date = state.fetchedAt
    ? new Date(state.fetchedAt).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "";
  sourceLabel.textContent = state.source === "steam" ? `STEAM DATA / ${date}` : `初期データ / ${date}`;
}

async function loadGames() {
  reloadButton.disabled = true;
  reloadButton.querySelector("span:first-child").textContent = "取得中…";
  updateSourceLabel("Steamに接続中");
  showSkeletons();

  try {
    const response = await fetch(`./games.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("データを取得できませんでした");
    const data = await response.json();
    state.allGames = (data.games || []).sort((a, b) => b.reviewCount - a.reviewCount);
    state.source = data.source;
    state.fetchedAt = data.generatedAt;
    updateSourceLabel();
    applyFilters();
  } catch (error) {
    state.allGames = [];
    state.games = [];
    state.visible = [];
    render();
    updateSourceLabel("取得エラー / 再試行してください");
  } finally {
    reloadButton.disabled = false;
    reloadButton.querySelector("span:first-child").textContent = "データ再読込";
  }
}

function exportCsv() {
  if (!state.visible.length) return;
  const rows = [
    ["順位", "タイトル", "高評価率", "レビュー数", "価格", "Steam URL"],
    ...state.visible.map((game, index) => [index + 1, game.title, `${game.positivePercent}%`, game.reviewCount, game.price, game.steamUrl])
  ];
  const csv = "\ufeff" + rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `steam-overwhelming-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

$("#searchInput").addEventListener("input", applyFilters);
$("#minimumSelect").addEventListener("change", applyFilters);
$("#sortSelect").addEventListener("change", applyFilters);
$("#limitSelect").addEventListener("change", applyFilters);
$("#reloadButton").addEventListener("click", loadGames);
$("#csvButton").addEventListener("click", exportCsv);

loadGames();
