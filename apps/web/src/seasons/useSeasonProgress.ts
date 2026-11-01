import { useCallback, useEffect, useRef, useState } from 'react';
import type { SeasonProgressItem } from '@garquinsfilm/shared';

import { ApiError } from '../api.js';
import {
  applySeasonBatch,
  getSeasonProgress,
  markSeasonComplete,
  markSeasonPending,
} from './seasons.api.js';

export type SeasonLoadState = 'loading' | 'ready' | 'error';

export interface SeasonFeedback {
  kind: 'success' | 'error';
  text: string;
}

export function seasonErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return 'No se pudo conectar con el servidor. Comprueba tu conexión.';
      case 400:
        return 'La solicitud de temporadas no es válida.';
      case 401:
        return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
      case 403:
        return 'El servidor ha rechazado la solicitud desde este origen.';
      case 404:
        return 'La serie ya no está disponible en tu biblioteca.';
      case 409:
        return 'Has alcanzado el límite de 500 temporadas completadas para esta serie.';
      case 413:
        return 'La solicitud es demasiado grande. Inténtalo con menos temporadas.';
      case 429:
        return 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.';
      case 503:
        return 'El servicio de temporadas no está disponible ahora. Inténtalo de nuevo más tarde.';
    }
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

interface OperationResult {
  text: string;
  apply: () => void;
}

function byNumber(items: SeasonProgressItem[]): SeasonProgressItem[] {
  return [...items].sort((a, b) => a.seasonNumber - b.seasonNumber);
}

/**
 * Estado de progreso de una entrada. Una sola operación a la vez: mientras hay una
 * petición pendiente se rechazan las demás (la interfaz también bloquea los controles),
 * y el estado solo cambia con la respuesta confirmada del servidor.
 */
export function useSeasonProgress(entryId: string, onUnauthorized: () => void) {
  const [completed, setCompleted] = useState<SeasonProgressItem[]>([]);
  const [loadState, setLoadState] = useState<SeasonLoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SeasonFeedback | null>(null);
  const pendingRef = useRef(false);
  const generationRef = useRef(0);
  const unauthorizedRef = useRef(onUnauthorized);

  useEffect(() => {
    unauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const generation = ++generationRef.current;
      setLoadState('loading');
      setLoadError('');
      try {
        const view = await getSeasonProgress(entryId, signal);
        if (signal?.aborted || generation !== generationRef.current) return;
        setCompleted(byNumber(view.completedSeasons));
        setLoadState('ready');
      } catch (error) {
        if (signal?.aborted || generation !== generationRef.current) return;
        if (error instanceof ApiError && error.status === 401) unauthorizedRef.current();
        setLoadError(seasonErrorMessage(error));
        setLoadState('error');
      }
    },
    [entryId],
  );

  useEffect(() => {
    const controller = new AbortController();
    pendingRef.current = false;
    setPending(null);
    setFeedback(null);
    setCompleted([]);
    void load(controller.signal);
    return () => {
      controller.abort();
      generationRef.current += 1;
    };
  }, [load]);

  const run = useCallback(
    async (key: string, operation: () => Promise<OperationResult>) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      const generation = generationRef.current;
      setPending(key);
      setFeedback(null);
      try {
        const { text, apply } = await operation();
        // Una respuesta de otra entrada o tras desmontar no debe tocar este estado.
        if (generation !== generationRef.current) return;
        apply();
        setFeedback({ kind: 'success', text });
      } catch (error) {
        if (generation !== generationRef.current) return;
        if (error instanceof ApiError && error.status === 401) unauthorizedRef.current();
        setFeedback({ kind: 'error', text: seasonErrorMessage(error) });
        // Tras un conflicto o una entrada desaparecida, el servidor es la fuente de verdad.
        if (error instanceof ApiError && [404, 409].includes(error.status)) {
          try {
            const view = await getSeasonProgress(entryId);
            if (generation === generationRef.current) setCompleted(byNumber(view.completedSeasons));
          } catch {
            // Se conserva el último estado confirmado y el mensaje de error original.
          }
        }
      } finally {
        if (generation === generationRef.current) {
          pendingRef.current = false;
          setPending(null);
        }
      }
    },
    [entryId],
  );

  const complete = useCallback(
    (seasonNumber: number, label: string) =>
      run(`season:${seasonNumber}`, async () => {
        const item = await markSeasonComplete(entryId, seasonNumber);
        return {
          text: `${label} marcada como vista.`,
          apply: () =>
            setCompleted((current) =>
              byNumber([...current.filter((c) => c.seasonNumber !== seasonNumber), item]),
            ),
        };
      }),
    [entryId, run],
  );

  const uncomplete = useCallback(
    (seasonNumber: number, label: string) =>
      run(`season:${seasonNumber}`, async () => {
        await markSeasonPending(entryId, seasonNumber);
        return {
          text: `${label} marcada como pendiente.`,
          apply: () =>
            setCompleted((current) => current.filter((c) => c.seasonNumber !== seasonNumber)),
        };
      }),
    [entryId, run],
  );

  const completeMany = useCallback(
    (seasonNumbers: number[], label: string) =>
      run('batch', async () => {
        const view = await applySeasonBatch(entryId, { complete: seasonNumbers });
        return {
          text: `${label}: ${seasonNumbers.length} ${
            seasonNumbers.length === 1 ? 'temporada marcada' : 'temporadas marcadas'
          } como vistas.`,
          apply: () => setCompleted(byNumber(view.completedSeasons)),
        };
      }),
    [entryId, run],
  );

  const showError = useCallback((text: string) => setFeedback({ kind: 'error', text }), []);

  return {
    completed,
    loadState,
    loadError,
    pending,
    feedback,
    reload: () => load(),
    complete,
    uncomplete,
    completeMany,
    showError,
  };
}
