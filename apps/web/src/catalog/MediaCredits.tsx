import { useState } from 'react';
import type { MediaCastMember, MediaCrewMember } from '@garquinsfilm/shared';

export function MediaCredits({
  cast,
  crew,
  crewTitle,
}: {
  cast: MediaCastMember[];
  crew: MediaCrewMember[];
  crewTitle: string;
}) {
  return (
    <section aria-labelledby="cast-title" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cast-title" className="text-xl font-bold text-slate-50">
          Reparto y equipo
        </h2>
        <span className="text-sm text-slate-400">{crewTitle}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(13rem,1fr)]">
        <section
          aria-labelledby="cast-list-title"
          className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 sm:p-5"
        >
          <h3 id="cast-list-title" className="font-semibold text-slate-100">
            Reparto
          </h3>
          {cast.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cast.map((person) => (
                <li
                  key={person.tmdbId}
                  className="flex min-w-0 items-center gap-3 rounded-lg bg-slate-900/60 p-3"
                >
                  <PersonAvatar name={person.name} profileUrl={person.profileUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{person.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {person.character || 'Personaje no disponible'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              No hay información del reparto disponible.
            </p>
          )}
        </section>

        <section
          aria-labelledby="crew-list-title"
          className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 sm:p-5"
        >
          <h3 id="crew-list-title" className="font-semibold text-slate-100">
            {crewTitle}
          </h3>
          {crew.length ? (
            <ul className="mt-4 space-y-3">
              {crew.map((person) => (
                <li key={person.tmdbId} className="flex min-w-0 items-center gap-3">
                  <PersonAvatar name={person.name} profileUrl={person.profileUrl} />
                  <p className="truncate text-sm font-medium text-slate-100">{person.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-400">No hay información disponible.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function PersonAvatar({ name, profileUrl }: { name: string; profileUrl: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  return profileUrl && !imageFailed ? (
    <img
      src={profileUrl}
      alt=""
      loading="lazy"
      onError={() => setImageFailed(true)}
      className="h-12 w-12 shrink-0 rounded-full bg-slate-700 object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-sm font-semibold text-red-200"
    >
      {name.trim().slice(0, 1).toLocaleUpperCase('es') || '?'}
    </span>
  );
}
