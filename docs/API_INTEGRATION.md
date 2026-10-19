# Integración con TMDB

**Sitio:** https://developer.themoviedb.org/
**Estado:** diseño aprobado en ADR-007 (`docs/DECISIONS.md`). **Implementado localmente (TMDB-API-001, rama `feature/tmdb-api-client`, pendiente de PR y GitHub Actions):** contratos TypeScript en `packages/shared`, configuración, cliente HTTP, errores tipados y su conversión HTTP, e inyección (`tmdbClient` / `app.tmdb`); véase «Cliente TMDB implementado». **No implementado todavía:** rutas `/api/search` y `/api/media/...`, normalización, caché y la interfaz (TMDB-API-002/003 y WEB-CATALOG-001/002, `docs/TASKS.md`). Ninguna prueba ni CI realiza llamadas reales a TMDB, y TMDB-TERMS-001 sigue pendiente.

Convención de este documento: **[Oficial]** requisito de TMDB; **[Aprobado]** decisión del responsable registrada en ADR-007; **[Propuesta]** valor o detalle de implementación a confirmar en la tarea correspondiente; **[PENDIENTE]** sin decisión.

## Condiciones oficiales de TMDB

Verificadas el 2026-10-19 en https://www.themoviedb.org/api-terms-of-use, https://developer.themoviedb.org/ y la FAQ oficial https://developer.themoviedb.org/docs/faq (logos, nombre y atribución; logos aprobados en https://www.themoviedb.org/about/logos-attribution). **Son un insumo técnico, no una validación jurídica; la validación del uso previsto es TMDB-TERMS-001 y sigue PENDIENTE.** Al implementar hay que releer la versión vigente.

- **[Oficial]** Licencia no exclusiva, intransferible y no sublicenciable. Uso gratuito solo **no comercial**; cobrar a usuarios, obtener ingresos (incluida publicidad) o ser un sitio «destino» exige un acuerdo comercial escrito con TMDB.
- **[Oficial]** No se puede cachear información de TMDB durante más de **6 meses**.
- **[Oficial]** Prohibido hacer «derivados» de la API o de su contenido (la compatibilidad de la normalización y la caché con esta cláusula está **PENDIENTE** de TMDB-TERMS-001).
- **[Oficial]** Prohibido usar la API o su contenido en aplicaciones de ML/IA o para entrenarlas, validarlas o entregar datasets cacheados a terceros para ello.
- **[Oficial]** Prohibido ocultar la identidad de la aplicación, degradar el servicio o usar ancho de banda excesivo.
- **[Oficial]** TMDB puede cambiar o terminar el servicio sin SLA.
- **[Oficial]** API v3 en `https://api.themoviedb.org/3`. Autenticación recomendada: cabecera `Authorization: Bearer <API Read Access Token>`; no se usa `api_key` por query.
- **[Oficial]** Rate limiting: el límite legado de 40 peticiones/10 s está deshabilitado, pero TMDB mantiene límites superiores (del orden de decenas de peticiones por segundo, sujetos a cambio) y responde 429 al superarlos. La cabecera `Retry-After` no está documentada: se trata como opcional.
- **[Oficial]** Errores JSON con `status_code` y `status_message`. Paginación de 20 resultados por página; páginas válidas del 1 al 500.
- **[Oficial]** `search/multi` devuelve películas, series **y personas** (`media_type`). Los resultados de búsqueda traen `genre_ids`, no nombres.
- **[Oficial]** Cada petición debe indicar `language`; si no hay traducción, TMDB puede devolver campos vacíos (p. ej. `overview`). Fechas desconocidas pueden venir como `""`; `poster_path`/`backdrop_path` pueden ser `null`.

### Atribución (obligatoria)

- **[Oficial]** Usar el logo de TMDB para identificar el uso de TMDB, sin alterar color ni proporción (logos aprobados en https://www.themoviedb.org/about/logos-attribution).
- **[Oficial]** El logo de TMDB debe ser **menos prominente** que los logos/marcas que identifican GarquinsFilm y no debe sugerir respaldo, certificación ni aprobación de TMDB.
- **[Oficial]** Mostrar de forma destacada el aviso: «This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.» (en inglés tal como lo exigen los términos; la validez de una traducción al español no está verificada).
- **[Oficial]** Referirse a TMDB solo como «TMDB» o «The Movie Database» y enlazar a https://www.themoviedb.org (FAQ: https://developer.themoviedb.org/docs/faq).
- **[PENDIENTE]** Ubicación exacta: los términos piden el aviso «prominently» y la FAQ menciona una sección «About»/créditos. Propuesta para WEB-CATALOG-001: una pantalla «Créditos» accesible desde la navegación del área privada con logo, aviso y enlace, y el logo/aviso breve visible en las pantallas de catálogo. Se confirma en TMDB-TERMS-001 antes de integrar WEB-CATALOG-001.

## Arquitectura del módulo de catálogo

**[Aprobado]** React → Fastify → TMDB API v3. Módulo en `apps/api/src/catalog/`; contratos en `packages/shared`. Detalle de responsabilidades, inyección y consumo de `packages/shared` en `docs/ARCHITECTURE.md`.

## Contrato interno aprobado

**[Aprobado]** Solo estas tres rutas, todas privadas (sesión Better Auth, 401 sin sesión). No se modifican los prefijos ni se añaden rutas alternativas sin aprobación:

- `GET /api/search`
- `GET /api/media/movie/:tmdbId`
- `GET /api/media/tv/:tmdbId`

Identidad del contenido: `{ source: 'tmdb', type: 'movie' | 'tv', tmdbId: number }`. El id numérico no identifica un título sin `type`. Estos tres campos son la referencia que reutilizarán biblioteca, valoraciones, listas y rankings; ninguna de esas funcionalidades forma parte de esta fase.

### `GET /api/search`

| Parámetro | Regla                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`       | Obligatorio. Se aplica `trim`; longitud de 1 a 100 caracteres tras el trim. Solo texto; se envía a TMDB como parámetro codificado, nunca concatenado en una ruta. |
| `type`    | `movie`, `tv` o `all`. Por defecto `all`.                                                                                                                         |
| `page`    | Entero entre 1 y 500. Por defecto 1.                                                                                                                              |

Esquema de entrada con `additionalProperties: false`; parámetros inválidos o desconocidos → 400.

Mapeo a TMDB **[Aprobado/Propuesta]**: `type=movie` → `search/movie`; `type=tv` → `search/tv`; `type=all` → `search/multi` (aprobado), descartando todo elemento cuyo `media_type` no sea `movie` o `tv` (personas incluidas). Siempre `include_adult=false` y `language=es-ES`. `region=ES` solo se envía a endpoints cuya documentación oficial vigente lo admita (en la revisión del 2026-10-19: `search/movie`; no `search/multi`); se verifica de nuevo al implementar TMDB-API-002.

Respuesta 200:

```json
{
  "page": 1,
  "totalPages": 3,
  "totalResults": 48,
  "results": [
    {
      "source": "tmdb",
      "type": "movie",
      "tmdbId": 603,
      "title": "Matrix",
      "originalTitle": "The Matrix",
      "year": 1999,
      "overview": "…",
      "posterUrl": "https://image.tmdb.org/t/p/w342/….jpg",
      "voteAverage": 8.2,
      "voteCount": 25000
    }
  ]
}
```

- `totalPages` nunca supera 500 (TMDB no sirve páginas posteriores).
- Una página fuera de rango dentro de 1–500 devuelve 200 con `results: []`.
- Con `type=all`, el filtrado de personas puede dejar menos de 20 elementos por página, y `totalPages`/`totalResults` proceden de TMDB y pueden incluir los elementos filtrados. Es una limitación aceptada de ADR-007.

### `GET /api/media/movie/:tmdbId`

Datos comunes (`source`, `type: 'movie'`, `tmdbId`, `title`, `originalTitle`, `year`, `overview`, `posterUrl`, `voteAverage`, `voteCount`) más:

| Campo         | Tipo                             | Notas                                            |
| ------------- | -------------------------------- | ------------------------------------------------ |
| `releaseDate` | `string \| null`                 | Fecha ISO `YYYY-MM-DD`; `""` o ausente → `null`. |
| `runtime`     | `number \| null`                 | Minutos; ausente o `0` → `null`.                 |
| `genres`      | `{ id: number, name: string }[]` | Vacío si TMDB no informa.                        |
| `status`      | `string \| null`                 | Estado según TMDB.                               |
| `backdropUrl` | `string \| null`                 | Imagen de fondo; `null` si falta.                |
| `tagline`     | `string \| null`                 | Cadena vacía → `null`.                           |

### `GET /api/media/tv/:tmdbId`

Datos comunes (con `type: 'tv'`) más:

| Campo              | Tipo                                                                    | Notas                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstAirDate`     | `string \| null`                                                        | Fecha ISO; vacío → `null`.                                                                                                                                                                                                                                                                            |
| `numberOfSeasons`  | `number \| null`                                                        |                                                                                                                                                                                                                                                                                                       |
| `numberOfEpisodes` | `number \| null`                                                        |                                                                                                                                                                                                                                                                                                       |
| `status`           | `string \| null`                                                        |                                                                                                                                                                                                                                                                                                       |
| `genres`           | `{ id: number, name: string }[]`                                        |                                                                                                                                                                                                                                                                                                       |
| `backdropUrl`      | `string \| null`                                                        |                                                                                                                                                                                                                                                                                                       |
| `seasons`          | `{ seasonNumber, name, episodeCount, airDate, posterUrl, isSpecial }[]` | Información de temporadas dentro del detalle; **no existe ruta `/seasons`**. `isSpecial` es `true` solo para `seasonNumber === 0` (especiales), que no debe confundirse con temporadas normales ni contarse en el progreso (PROD-006, `docs/DATA_MODEL.md`). `airDate`/`posterUrl` pueden ser `null`. |

### Reglas comunes

- `:tmdbId` es un entero positivo (sin signos, decimales ni notación científica; p. ej. patrón `^[1-9][0-9]{0,9}$`); en caso contrario, 400. El servidor construye la URL de TMDB solo con ese entero; el cliente nunca aporta rutas ni URLs.
- Imágenes ausentes → `null`; el frontend muestra un marcador de posición.
- Fechas desconocidas → `null`. `year` se deriva de los cuatro primeros dígitos de la fecha; `null` si no hay fecha.
- **Normalización por tipo [Propuesta, a confirmar en TMDB-API-002/003 con fixtures]:** para `movie`, `title`←`title`, `originalTitle`←`original_title` y `year`←`release_date`; para `tv`, `title`←`name`, `originalTitle`←`original_name` y `year`←`first_air_date`. En `search/multi` se decide por `media_type`. No está verificado contra respuestas reales de TMDB.
- **Votos ausentes no son 0.** **[Propuesta de normalización]**: si TMDB informa 0 votos o no informa votos, `voteAverage` es `null`; `voteCount` refleja el valor recibido (`0`) o `null` si falta. Nunca se muestra «0,0» como puntuación inexistente.
- **Idioma y fallback [Aprobado: `es-ES` con fallback a datos originales]:** el título se pide en `es-ES` (TMDB devuelve el original si no hay traducción) y `originalTitle` es el título original. Si `overview` llega vacío, el contrato lo representa como `null` y la sinopsis puede completarse con datos en el idioma original. **[Propuesta/PENDIENTE de detalle]**: mecanismo (segunda consulta con `original_language` solo en detalle, no en búsqueda) y si la respuesta debe indicar que es un fallback; se define en TMDB-API-002/003.
- Los campos desconocidos de TMDB no se reenvían: solo se exponen los campos del contrato (sin respuestas internas de TMDB, `status_message`, cabeceras ni secretos).
- Los tipos TypeScript de estos contratos viven en `packages/shared` y los consumen API y web.

### Errores HTTP

Cuerpo `{ "error": "<mensaje genérico en español>" }`, coherente con el resto de la API.

| HTTP | Cuándo                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | Parámetros inválidos (`q`, `type`, `page`, `tmdbId`, propiedades desconocidas).                                                        |
| 401  | Sin sesión válida.                                                                                                                     |
| 404  | El título no existe en TMDB (o ruta desconocida).                                                                                      |
| 429  | Límite de peticiones propio, o 429 de TMDB; se incluye `Retry-After` solo si hay un valor fiable.                                      |
| 502  | Respuesta de TMDB inválida o no interpretable.                                                                                         |
| 503  | TMDB no disponible (errores 5xx o de red), credencial ausente/rechazada u otro fallo de configuración del catálogo. No se revela cuál. |
| 504  | Timeout al consultar TMDB.                                                                                                             |

## Operaciones futuras (NO aprobadas ni incluidas en TMDB-001)

Las rutas siguientes son **orientativas, no aprobadas y no implementadas**; se concretarán en sus tareas (DISC-_, LIB-_, TV-001) y requieren aprobación:

- Descubrimiento por género, año, fecha, puntuación media y conteo de votos (`GET /api/discover`).
- Rankings (`GET /api/rankings/top`).
- Detalle por temporada o episodios (no hay ruta `/seasons` aprobada; las temporadas viajan en el detalle de serie).
- Tendencias/popularidad solo como descubrimiento auxiliar, sin confundirlas con mejores valoradas.

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

## Caché

**[Aprobado]** Caché en memoria del proceso, con TTL limitado, sin infraestructura externa, sin `stale-if-error`. **[Propuesta]** valores iniciales conservadores (muy inferiores al máximo oficial de 6 meses), ajustables en TMDB-API-002/003 sin revisar el ADR mientras sigan por debajo de ese máximo:

| Dato                              | TTL inicial | Máx. entradas |
| --------------------------------- | ----------- | ------------- |
| Búsquedas                         | 5 minutos   | 500           |
| Detalles de película o serie      | 6 horas     | 1000          |
| Configuración de imágenes de TMDB | 24 horas    | 1             |

Reglas:

- La clave incluye endpoint, parámetros normalizados, idioma y región. Los datos de catálogo no dependen del usuario; no se almacena nada personal ni credenciales.
- **Una entrada caducada nunca se devuelve**: se comprueba su expiración en cada lectura, se elimina y se consulta de nuevo a TMDB. Si TMDB falla, se devuelve el error correspondiente (503/504/429/502), no datos antiguos.
- Limpieza periódica de entradas caducadas (temporizador que no impida cerrar el proceso) y tope de entradas con descarte de las más antiguas para acotar memoria.
- No se cachean errores ni respuestas inválidas.
- Se pierde al reiniciar y no se comparte entre instancias; es intencionado en el MVP.

## Robustez y seguridad

- **[Aprobado]** `TMDB_READ_ACCESS_TOKEN` es un secreto exclusivo del backend: no se envía al navegador, no aparece en respuestas, logs, errores ni CI, y no se versiona.
- **[Propuesta; implementado en TMDB-API-001]** Timeout por petición de `TMDB_TIMEOUT_MS` (por defecto 5000 ms; rango válido 1000–15000 ms, fuera del cual la configuración se rechaza).
- **[Propuesta; implementado en TMDB-API-001]** Reintentos acotados (como máximo 2) con backoff de 250 y 500 ms, solo para peticiones GET idempotentes y solo ante errores de red, timeout, 502/503/504. Un 429 de TMDB no se reintenta salvo que `Retry-After` indique una espera de 2 s o menos; en otro caso se devuelve 429 al cliente. Hay un presupuesto de tiempo total por llamada, reintentos y esperas incluidos (por defecto, el doble del timeout), y el plazo de cada intento nunca supera lo que queda de él. No se reintentan 404, otros 4xx, JSON inválido ni un 500 genérico.
- **Anti-SSRF [Aprobado: host fijo]:** el cliente llama únicamente a `https://api.themoviedb.org/3` (host y esquema fijos en código; sin variable de URL base) y solo con rutas construidas por el servidor a partir de enteros y de parámetros validados. Nunca se hace una petición a una URL aportada por el usuario ni se siguen redirecciones a otros hosts.
- Validación estricta de entradas (Ajv, `additionalProperties: false`), límite de página 500, longitud máxima de `q` y `include_adult=false` fijo.
- Rate limiting propio por ruta mediante el plugin existente. **[Propuesta]** valores iniciales: búsqueda 30/min y detalles 60/min por usuario o IP.
- Logs sanitizados: solo tipo de error, motivo, código de estado, intento y duración; nunca el token, la consulta `q` ni fragmentos del cuerpo remoto.
- TMDB caído: error controlado y recuperable en la interfaz; los datos propios (biblioteca, valoraciones, listas) no dependen de TMDB y no se ven afectados.

### Cliente TMDB implementado (TMDB-API-001)

Estado: implementado localmente en `feature/tmdb-api-client`, **pendiente de PR y GitHub Actions**. Sin rutas de catálogo y sin llamadas reales a TMDB (tests con transporte simulado). Código en `apps/api/src/catalog/` y contratos en `packages/shared`.

- **Autenticación:** cabecera `Authorization: Bearer <TMDB_READ_ACCESS_TOKEN>`; nunca en la URL, y se rechaza `api_key` como parámetro. El token se valida (sin espacios ni caracteres de control) y solo se exige al usar el catálogo (`getTmdbConfig()` perezoso); la API arranca y autentica sin él.
- **Peticiones:** solo `GET` a `https://api.themoviedb.org/3`; segmentos de ruta estáticos o enteros positivos, parámetros codificados con `URLSearchParams`, `redirect: 'error'` (las redirecciones se rechazan, no se siguen; hoy se clasifican como fallo de red, ver el mapeo).
- **Plazo garantizado:** cada intento es una carrera entre la operación completa (petición y lectura del cuerpo) y un temporizador, además del `AbortController`. Vence con `TmdbTimeoutError` aunque el transporte ignore la señal; una respuesta tardía se cancela y descarta sin rechazos sin gestionar.
- **Cuerpo limitado:** máximo 2.000.000 de bytes (`TMDB_MAX_BODY_BYTES`). Se rechaza por `Content-Length` excesivo sin leer y, en su defecto o si es falso, se lee por fragmentos con acumulador acotado y se cancela al superarlo; el JSON solo se interpreta tras validar el tamaño.
- **`Retry-After`:** solo se considera fiable en segundos enteros de 0 a 3600; una fecha HTTP, un decimal, un negativo o un valor mayor se ignoran y no se reenvían.
- **Errores tipados → HTTP** (`toCatalogHttpError`):

  | Error                      | Origen                                        | HTTP                                      |
  | -------------------------- | --------------------------------------------- | ----------------------------------------- |
  | `TmdbNotFoundError`        | 404 de TMDB                                   | 404                                       |
  | `TmdbRateLimitError`       | 429 de TMDB                                   | 429 (con `Retry-After` solo si es fiable) |
  | `TmdbInvalidResponseError` | JSON inválido, cuerpo excesivo, otros 3xx/4xx | 502                                       |
  | `TmdbUnavailableError`     | red, 5xx, 401/403 de TMDB                     | 503                                       |
  | `TmdbConfigError`          | token ausente o configuración inválida        | 503                                       |
  | `TmdbTimeoutError`         | plazo agotado                                 | 504                                       |

  Los mensajes públicos son genéricos; la causa interna (`reason`) no se envía al cliente.

- **Inyección:** `buildApp({ tmdbClient })` y `app.tmdb.get()` (proveedor perezoso); los tests inyectan un cliente simulado `{ language, region, getJson }`. TMDB-API-002/003 construirán sobre él `catalog.service.ts`.
- **Variables:** `TMDB_DEFAULT_LANGUAGE` (`xx-XX`, por defecto `es-ES`) y `TMDB_DEFAULT_REGION` (`XX`, por defecto `ES`) se validan; el cliente las expone como `language` y `region`.
- **Pendiente para TMDB-API-002/003:** el cliente devuelve `unknown`; la validación y normalización de las respuestas, la caché y las rutas.
- **Imágenes [Aprobado: sin proxy]:** el servidor construye `https://image.tmdb.org/t/p/{tamaño}{ruta}` a partir de los `*_path` de TMDB, con host fijo y tamaños de una lista permitida. **[Propuesta]** inicial: póster `w342` en búsqueda y `w500` en detalle (`w185` para temporadas), fondo `w780`. El navegador las descarga directamente de la CDN; la IP del usuario llega a TMDB (consecuencia aceptada en ADR-007). Una ruta ausente, no válida o con tamaño no permitido produce `null`.
- **Pruebas:** mocks y fixtures del cliente TMDB inyectados en la aplicación; ninguna prueba ni CI usa credenciales reales ni red real.
- La credencial solo es necesaria cuando se active el catálogo; su ausencia no impide arrancar la API ni ejecutar las pruebas de autenticación existentes.

## Variables de entorno previstas

Se documentan en `.env.example` (sin valores secretos). No hay `TMDB_API_BASE_URL`.

| Variable                 | Uso                                                       |
| ------------------------ | --------------------------------------------------------- |
| `TMDB_READ_ACCESS_TOKEN` | Token de lectura de TMDB. Secreto solo del backend.       |
| `TMDB_TIMEOUT_MS`        | Timeout por petición a TMDB.                              |
| `TMDB_DEFAULT_LANGUAGE`  | Idioma preferido (`es-ES`).                               |
| `TMDB_DEFAULT_REGION`    | Región (`ES`), aplicada solo donde el endpoint la admita. |

## Restricción de IA

**[Aprobado / Oficial]** No enviar contenido TMDB a sistemas de IA generativa ni usarlo para entrenamiento sin autorización y licencias verificadas; los términos de TMDB lo prohíben expresamente para ML/IA. El MVP utiliza filtrado y reglas convencionales.
