export function parseRatingScore(value: string): number | null | undefined {
  if (value.trim() === '') return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d)?|\.\d)$/.test(normalized)) return undefined;
  const score = Number(normalized);
  if (!Number.isFinite(score) || score < 0 || score > 10 || !Number.isInteger(score * 10)) {
    return undefined;
  }
  return score;
}

export function normalizeRatingReview(value: string): string | null {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

export function isValidRatingReview(value: string): boolean {
  if (value.includes('\0')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function ratingReviewLength(value: string): number {
  return Array.from(value.replace(/\r\n?/g, '\n')).length;
}
