const ENTITY_MAP = {
  '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&yen;': '¥',
};

export function decodeEntities(value = '') {
  return value
    .replace(/&(amp|quot|#39|lt|gt|nbsp|yen);/g, (entity) => ENTITY_MAP[entity] || entity)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function parseYenPrice(value = '') {
  const text = decodeEntities(String(value).normalize('NFKC')).replace(/\s+/g, '');
  if (!text) return null;
  if (/free|無料/i.test(text)) return 0;
  const match = text.match(/(?:JP)?[¥￥]([\d,]+)|([\d,]+)円|JPY([\d,]+)/i);
  const digits = match?.slice(1).find(Boolean)?.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function priceText(row, className) {
  return decodeEntities(
    row.match(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, 'i'))?.[1] || '',
  );
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
    const legacyPriceHtml = row.match(/class="[^"]*\bsearch_price\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const legacyOriginalHtml = legacyPriceHtml.match(/<strike\b[^>]*>([\s\S]*?)<\/strike>/i)?.[1] || '';
    const legacyFinalHtml = legacyPriceHtml.replace(/<strike\b[^>]*>[\s\S]*?<\/strike>/gi, ' ');
    const finalPriceText = priceText(row, 'discount_final_price') || decodeEntities(legacyFinalHtml);
    const originalPriceText = priceText(row, 'discount_original_price') || decodeEntities(legacyOriginalHtml);
    const modernDiscount = Number(
      row.match(/class="[^"]*discount_pct[^"]*"[^>]*>\s*-?(\d+)%/i)?.[1] || 0,
    );
    const legacyDiscountHtml = row.match(/class="[^"]*search_discount[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const attributeDiscount = Number(row.match(/\bdata-discount="(\d+)"/i)?.[1] || 0);
    const discountPercent = modernDiscount
      || Number(legacyDiscountHtml.match(/-?(\d+)%/)?.[1] || 0)
      || attributeDiscount;
    const minorUnitPrice = Number(row.match(/\bdata-price-final="(\d+)"/i)?.[1]);
    const fallbackPrice = Number.isFinite(minorUnitPrice) ? Math.round(minorUnitPrice / 100) : null;
    const priceYen = parseYenPrice(finalPriceText) ?? fallbackPrice;
    const originalPriceYen = parseYenPrice(originalPriceText);
    const isOnSale = discountPercent > 0
      || (priceYen !== null && originalPriceYen !== null && originalPriceYen > priceYen);
    const isFree = priceYen === 0 && !isOnSale;
    return {
      appId: Number(appId),
      name,
      imageUrl,
      percent,
      searchReviewCount,
      priceYen,
      originalPriceYen,
      discountPercent,
      isOnSale,
      isFree,
    };
  }).filter((item) => Number.isInteger(item.appId) && item.name);
}

export function isOverwhelminglyPositive(summary, minimumReviews = 500, minimumPercent = 95) {
  const positive = Number(summary?.total_positive) || 0;
  const negative = Number(summary?.total_negative) || 0;
  const total = Number(summary?.total_reviews) || positive + negative;
  return total >= minimumReviews && total > 0 && (positive / total) * 100 >= minimumPercent;
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
    priceYen: Number.isFinite(searchItem.priceYen) ? searchItem.priceYen : null,
    originalPriceYen: Number.isFinite(searchItem.originalPriceYen) ? searchItem.originalPriceYen : null,
    discountPercent: Number(searchItem.discountPercent) || 0,
    isOnSale: searchItem.isOnSale === true,
    isFree: searchItem.isFree === true,
  };
}

export function rankGames(games, limit = Infinity) {
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
