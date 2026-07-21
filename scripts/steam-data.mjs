const ENTITY_MAP = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
};

export function decodeEntities(value = '') {
  return value
    .replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (entity) => ENTITY_MAP[entity] || entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function parseSearchResults(html) {
  const rows = html.match(/<a\b[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi) || [];
  return rows.map((row) => {
    const appId = row.match(/data-ds-appid="(\d+)/i)?.[1] || row.match(/\/app\/(\d+)/i)?.[1];
    const name = decodeEntities(row.match(/<span\s+class="title">([\s\S]*?)<\/span>/i)?.[1] || '');
    const imageUrl = decodeEntities(row.match(/<img[^>]+src="([^"]+)"/i)?.[1] || '');
    const tooltip = decodeEntities(row.match(/data-tooltip-html="([^"]+)"/i)?.[1] || '');
    const percent = Number(tooltip.match(/(\d{1,3})%/)?.[1] || 0);
    const totalText = tooltip.match(/([\d,.]+)\s+(?:user\s+)?reviews?/i)?.[1] || '0';
    const searchReviewCount = Number(totalText.replace(/[^\d]/g, ''));
    return { appId: Number(appId), name, imageUrl, percent, searchReviewCount };
  }).filter((item) => Number.isInteger(item.appId) && item.name);
}

export function isOverwhelminglyPositive(summary) {
  return Number(summary?.review_score) === 9;
}

export function toGame(searchItem, summary) {
  const totalPositive = Number(summary.total_positive) || 0;
  const totalNegative = Number(summary.total_negative) || 0;
  const totalReviews = Number(summary.total_reviews) || totalPositive + totalNegative;
  return {
    appId: searchItem.appId,
    name: searchItem.name,
    imageUrl: searchItem.imageUrl || `https://cdn.akamai.steamstatic.com/steam/apps/${searchItem.appId}/header.jpg`,
    storeUrl: `https://store.steampowered.com/app/${searchItem.appId}/`,
    positivePercent: totalReviews ? Math.round((totalPositive / totalReviews) * 1000) / 10 : 0,
    totalPositive,
    totalNegative,
    totalReviews,
    reviewScore: Number(summary.review_score),
    reviewLabel: summary.review_score_desc || 'Overwhelmingly Positive',
  };
}

export function rankGames(games, limit = 200) {
  const unique = new Map();
  for (const game of games) {
    const current = unique.get(game.appId);
    if (!current || game.totalReviews > current.totalReviews) unique.set(game.appId, game);
  }
  return [...unique.values()]
    .sort((a, b) => b.totalReviews - a.totalReviews || a.name.localeCompare(b.name, 'en'))
    .slice(0, limit);
}

export function failedData(previous, attemptedAt, message) {
  const previousGames = Array.isArray(previous?.games) ? previous.games : [];
  const canUsePrevious = previousGames.length > 0 && previous?.meta?.lastSuccessfulAt;
  return {
    meta: {
      ...(previous?.meta || {}),
      status: canUsePrevious ? 'stale' : 'error',
      attemptedAt,
      message,
      source: 'Steam Store',
    },
    games: canUsePrevious ? previousGames : [],
  };
}
