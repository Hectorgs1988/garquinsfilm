import { useEffect, useState } from 'react';
import type { MediaDetail, MediaSummary } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import { getMediaDetail } from './catalog.api.js';
import { MediaDetailPage } from './MediaDetailPage.js';

/**
 * Muestra la ficha enseguida con lo que ya trajo la búsqueda y la completa
 * cuando llega el detalle. Si la ampliación falla, la ficha básica se queda.
 */
export function MediaDetailLoader({
  media,
  onBack,
  onUnauthorized,
}: {
  media: MediaSummary;
  onBack: () => void;
  onUnauthorized?: () => void;
}) {
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setDetail(null);
    setError('');

    getMediaDetail(media.type, media.tmdbId, controller.signal)
      .then((loaded) => {
        if (active) setDetail(loaded);
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized?.();
          return;
        }
        setError('No se pudo cargar la información ampliada de este título.');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [media.type, media.tmdbId, onUnauthorized]);

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="status"
          className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300"
        >
          {error}
        </p>
      )}
      <MediaDetailPage media={detail ?? media} onBack={onBack} onUnauthorized={onUnauthorized} />
    </div>
  );
}
