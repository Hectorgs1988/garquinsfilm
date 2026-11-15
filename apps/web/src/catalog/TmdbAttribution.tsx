/**
 * Aviso que exige la licencia de la API de TMDB. El texto es literal y no debe
 * traducirse; el logotipo ha de quedar menos destacado que el de la aplicación
 * y no puede alterarse en color ni proporciones.
 */
export function TmdbAttribution({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <img
        src="/tmdb.svg"
        alt="The Movie Database"
        className="block h-auto w-20"
        loading="lazy"
        // Mientras el logotipo no esté descargado, el aviso de texto se basta solo.
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
      <p className="text-xs text-slate-500">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
