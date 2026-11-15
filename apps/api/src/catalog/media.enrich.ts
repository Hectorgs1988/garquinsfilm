import type { MediaSummary, MediaType } from '@garquinsfilm/shared';

/** Cualquier cosa que identifique un título y pueda llevar sus metadatos al lado. */
export interface EnrichableItem {
  type: MediaType;
  tmdbId: number;
  media: MediaSummary | null;
}

/** Tiempo máximo que la biblioteca espera a TMDB antes de responder sin títulos. */
export const ENRICH_TIMEOUT_MS = 2000;
/** Llamadas simultáneas a TMDB por petición de biblioteca. */
export const ENRICH_CONCURRENCY = 6;

export interface MediaSummaryLoader {
  load(type: MediaType, tmdbId: number): Promise<MediaSummary | null>;
}

export interface EnrichOptions {
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * Recorta un detalle de catálogo a los campos que la biblioteca publica: el reparto,
 * los vídeos o las plataformas no tienen por qué viajar en cada entrada.
 */
export function toMediaSummary(detail: MediaSummary): MediaSummary {
  return {
    source: detail.source,
    type: detail.type,
    tmdbId: detail.tmdbId,
    title: detail.title,
    originalTitle: detail.originalTitle,
    year: detail.year,
    overview: detail.overview,
    posterUrl: detail.posterUrl,
    voteAverage: detail.voteAverage,
    voteCount: detail.voteCount,
  };
}

/**
 * Completa `media` en cada entrada. La biblioteca funciona sin metadatos, así que
 * cualquier fallo, carencia de configuración o demora deja la entrada como estaba:
 * nunca propaga el error ni retiene la respuesta más de `timeoutMs`.
 */
export async function enrichEntries<T extends EnrichableItem>(
  entries: T[],
  loader: MediaSummaryLoader | null,
  options: EnrichOptions = {},
): Promise<T[]> {
  if (!loader) return entries;

  const identities = new Map<string, { type: MediaType; tmdbId: number }>();
  for (const entry of entries) {
    if (entry.media) continue;
    identities.set(cacheKey(entry.type, entry.tmdbId), {
      type: entry.type,
      tmdbId: entry.tmdbId,
    });
  }
  if (identities.size === 0) return entries;

  const activeLoader = loader;
  const summaries = new Map<string, MediaSummary>();
  const pending = [...identities].map(([key, identity]) => ({ key, identity }));
  let cursor = 0;
  let expired = false;

  async function worker(): Promise<void> {
    while (!expired) {
      const item = pending[cursor];
      cursor += 1;
      if (!item) return;
      try {
        const summary = await activeLoader.load(item.identity.type, item.identity.tmdbId);
        if (summary) summaries.set(item.key, summary);
      } catch {
        // Un título sin metadatos no invalida el resto de la biblioteca.
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      resolve();
    }, options.timeoutMs ?? ENRICH_TIMEOUT_MS);
  });

  try {
    const workers = Array.from(
      { length: Math.min(options.concurrency ?? ENRICH_CONCURRENCY, pending.length) },
      () => worker(),
    );
    await Promise.race([Promise.all(workers), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (summaries.size === 0) return entries;

  return entries.map((entry) => {
    if (entry.media) return entry;
    const summary = summaries.get(cacheKey(entry.type, entry.tmdbId));
    return summary ? { ...entry, media: summary } : entry;
  });
}

function cacheKey(type: MediaType, tmdbId: number): string {
  return `${type}:${tmdbId}`;
}
