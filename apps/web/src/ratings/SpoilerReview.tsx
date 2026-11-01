import { useState } from 'react';

export function SpoilerReview({
  review,
  containsSpoilers,
}: {
  review: string;
  containsSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!containsSpoilers) {
    return <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{review}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-amber-200">Esta reseña contiene spoilers</p>
      {revealed ? (
        <>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{review}</p>
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm font-semibold text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
          >
            Ocultar reseña
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="min-h-11 rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 text-sm font-semibold text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
        >
          Mostrar reseña
        </button>
      )}
    </div>
  );
}
