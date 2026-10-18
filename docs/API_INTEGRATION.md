# Integración con TMDB — diseño preliminar

**Sitio:** https://developer.themoviedb.org/ **Condiciones:** verificar términos, atribución, caché y licencia antes de producción.

## Operaciones previstas
- Búsqueda multi / búsqueda por película o serie; normalizar el tipo de contenido.
- Detalle de película, detalle de serie y temporadas.
- Descubrimiento por género, año, rango de fechas, voto medio y conteo de votos.
- Tendencias/popularidad como descubrimiento auxiliar, sin confundir con mejores valoradas.
- Imágenes/carteles según configuración oficial de TMDB.

## Contrato interno orientativo
- `GET /api/search?q=...&type=movie|tv|all&page=1`
- `GET /api/media/:type/:tmdbId`
- `GET /api/media/tv/:tmdbId/seasons`
- `GET /api/discover?type=...&genre=...&period=...&minVotes=...`
- `GET /api/rankings/top?type=...&period=...&limit=5`

Los endpoints son propuestos, no están implementados. API interna debe validar parámetros y utilizar respuestas normalizadas.

## Ranking: semántica propuesta
- Películas recientes: `release_date` dentro del periodo elegido, considerando la definición/región de estreno elegida.
- Series recientes: `first_air_date`, no temporada de estreno.
- Ordenar por `vote_average` descendente y desempatar por `vote_count`; exigir mínimo de votos.
- Mostrar fuente (TMDB), periodo, umbral y fecha de actualización.
- Si no hay suficientes resultados, devolver menos de cinco en lugar de inventar títulos.

## Robustez
Timeout, retry limitado con backoff, gestión de 429, manejo de imágenes ausentes, caché con TTL según licencia y trazabilidad sin secretos. Datos ausentes no deben interpretarse como cero.

## Restricción IA
No enviar contenido de TMDB a sistemas de IA generativa sin verificar permisos de uso. El MVP usa filtrado/reglas convencionales.
