# Integración con TMDB — diseño preliminar

**Sitio:** https://developer.themoviedb.org/
**Condiciones:** verificar términos, atribución, caché, uso de imágenes y licencia antes de producción. La clave de acceso permanece en el servidor.

## Operaciones previstas

- Búsqueda multi / búsqueda por película o serie; normalizar el tipo de contenido.
- Detalle de película, detalle de serie y temporadas.
- Descubrimiento por género, año, fecha, puntuación media y conteo de votos.
- Tendencias/popularidad como descubrimiento auxiliar, sin confundirlas con mejores valoradas.
- Imágenes/carteles según configuración oficial de TMDB.

## Contrato interno orientativo

- `GET /api/search?q=...&type=movie|tv|all&page=1`
- `GET /api/media/:type/:tmdbId`
- `GET /api/media/tv/:tmdbId/seasons`
- `GET /api/discover?type=...&genre=...&period=...&minVotes=...`
- `GET /api/rankings/top?type=...&period=...&region=ES&limit=5`

Los endpoints son propuestos, no están implementados. La API debe validar parámetros y utilizar respuestas normalizadas.

## Rankings aprobados inicialmente

Para películas:

- Región por defecto: España (`ES`).
- Ranking principal: hasta cinco resultados.
- Películas recientes: fecha de estreno dentro de los últimos 90 días.
- Umbral inicial: al menos 100 votos.
- Orden: `vote_average` descendente, luego `vote_count` descendente y finalmente título ascendente.
- Si hay menos de cinco resultados que cumplan los criterios, devolver solo los disponibles.
- Mostrar la fuente TMDB, período, región, umbral y fecha de actualización.

**Rankings de series:** los criterios de región, período/fecha, umbral y orden siguen pendientes. No aplicarles por defecto las reglas aprobadas para películas. La definición existente de `first_air_date` es una propuesta, no una regla aprobada.

Las reglas para rankings personales se basan únicamente en las valoraciones del usuario. Los filtros de género/año y otros rankings deben respetar las decisiones anteriores y no presentar resultados como rankings oficiales de FilmAffinity.

## Robustez

Timeout, reintentos limitados con backoff, gestión de 429, manejo de imágenes ausentes, caché con TTL conforme a los términos y trazabilidad sin secretos. Los datos ausentes no deben interpretarse como cero.

## Restricción de IA

No enviar contenido TMDB a sistemas de IA generativa sin verificar permisos de uso. El MVP utiliza filtrado y reglas convencionales.
