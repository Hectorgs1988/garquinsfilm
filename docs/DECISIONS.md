# Registro de decisiones

Este documento distingue decisiones aprobadas de cuestiones todavía pendientes. Las propuestas y los detalles no enumerados como aprobados no se deben tratar como decisiones.

## Decisiones de producto aprobadas

- **PROD-001:** El producto se llama GarquinsFilm.
- **PROD-002:** Películas y series forman parte del MVP.
- **PROD-003:** Cada usuario tiene una cuenta individual con email y contraseña.
- **PROD-004:** Las valoraciones van de 0,0 a 10,0, en incrementos de 0,1.
- **PROD-005:** Para valorar un título, debe estar primero en la biblioteca personal.
- **PROD-006:** El progreso de series se registra por temporadas completas; no se siguen episodios en el MVP.
- **PROD-007:** Las listas compartidas forman parte del MVP y no publican valoraciones personales.
- **PROD-008:** Los miembros pueden añadir y retirar títulos. El propietario administra los miembros y puede eliminar la lista.
- **PROD-009:** Los re-visionados quedan fuera del MVP; se mantiene una entrada por título y usuario.
- **PROD-010:** No se filtran títulos por suscripciones a servicios de streaming.
- **PROD-011:** TMDB es la fuente externa de películas y series. Los rankings no se presentan como rankings oficiales de FilmAffinity.
- **PROD-012:** El registro es mediante invitación; se incluyen recuperación de contraseña y sesiones seguras. Mailpit está aprobado para desarrollo local y los tests usan remitente simulado; un proveedor de correo remoto sigue pendiente.

## ADR-001 — Base de datos y desarrollo local

**Estado: APROBADO**

- PostgreSQL es la base de datos del proyecto.
- El entorno local utilizará Docker para PostgreSQL.
- El hosting de base de datos para staging y producción no queda decidido por este ADR.

## ADR-002 — Stack de aplicación y herramientas

**Estado: APROBADO**

- Frontend: React, TypeScript, Vite y Tailwind CSS.
- Backend: Node.js y Fastify.
- Persistencia: PostgreSQL con Prisma.
- Monorepositorio: pnpm workspaces.
- Pruebas: Vitest y Playwright.
- CI: GitHub Actions.
- TMDB: fuente externa para películas y series, consumida desde el servidor (detalle de la integración en ADR-007).

Las versiones concretas se fijarán durante el bootstrap atendiendo a compatibilidad y soporte. La integración Better Auth se rige además por ADR-003.

## ADR-003 — Autenticación y correo

**Estado: PARCIALMENTE APROBADO — decisiones funcionales y de seguridad aprobadas; validación local completada; CI de la autenticación finalizada correctamente en la PR #11**

- Better Auth 1.7.11 será la solución de autenticación para email/contraseña y sesiones. La integración con Fastify 5.12.7 y Prisma 7.10.1 se probó localmente; los modelos y la migración versionada se validaron en una base PostgreSQL 17 efímera y aislada. GitHub Actions repite los checks y finalizó correctamente tras integrar la PR #11 en `develop`. Cualquier cambio de versión requiere revalidación.
- El registro público estará deshabilitado. Solo se crearán cuentas mediante una invitación válida.
- Solo los administradores pueden emitir invitaciones. Cada invitación se vincula a un email normalizado, expira a los 7 días y solo puede aceptarse una vez.
- El token de invitación será aleatorio y de alta entropía; se almacenará únicamente su hash. La aceptación será atómica y estará protegida frente a solicitudes concurrentes.
- Tras aceptar correctamente una invitación no se exigirá una verificación adicional del correo.
- Habrá dos roles globales: `admin` y `user`. Los roles serán asignados y autorizados exclusivamente en el servidor, nunca desde parámetros del navegador.
- La propiedad de una lista compartida es independiente del rol global. Los permisos de propietario de lista no se derivan de ser `admin`.
- El primer administrador se creará mediante un procedimiento local controlado, nunca mediante un endpoint público.
- Para desarrollo local se utilizará Mailpit con Docker a través de un adaptador SMTP configurable. Las pruebas automatizadas usarán un remitente simulado y no enviarán correos reales. La aceptación del servidor SMTP no significa recepción final.
- No se desactivarán las protecciones CSRF ni las comprobaciones de origen. Se protegerán sesiones y cookies, se limitarán intentos en endpoints de autenticación y no se registrarán tokens, contraseñas ni cookies.
- No se incluirán credenciales reales en archivos versionados.
- Invitaciones y bootstrap local del primer administrador están implementados. Los CLI exigen `NODE_ENV=development`, allowlist del destino e identidad PostgreSQL verificada, además de un desafío interactivo aleatorio por operación. Las invitaciones permanecen inutilizables hasta la aceptación SMTP y la activación persistida. Better Auth gestiona recuperación con tokens temporales de un solo uso y revocación de sesiones. Mailpit es el destino local; no se ha aprobado proveedor remoto.
- Decisión MVP: si SMTP acepta un correo de invitación pero PostgreSQL falla antes de confirmar la activación, la API devuelve un error controlado y la invitación permanece no utilizable, salvo que la transacción ya se hubiera confirmado y solo se perdiera la respuesta. No se implementan reintentos automáticos, colas ni regeneración automática. Tras recuperar PostgreSQL, el administrador consulta el estado; revoca manualmente la invitación si sigue `PENDING_DELIVERY` o `DELIVERY_FAILED` y emite otra nueva. El token anterior nunca se reactiva ni reutiliza.
- Mejora futura: interfaz de administración para gestionar invitaciones `PENDING_DELIVERY` y `DELIVERY_FAILED`. Los formularios frontend de aceptación de invitaciones y restablecimiento de contraseña (WEB-AUTH-001) están implementados, probados localmente e integrados en `develop` (PR #11).
- QA validó localmente el flujo real administrador → `POST /api/admin/invitations` → SMTP → Mailpit → enlace → aceptación (201; correo recibido; enlace con `email` y `token`; invitación `ACTIVE`; aceptación con rol `user`; reutilización rechazada; usuario no administrador con 403; fallo SMTP sin invitaciones `ACTIVE`). Es una validación local con Mailpit, no con un proveedor de producción.
- **PENDIENTE:** proveedor SMTP de producción y pruebas en dispositivo móvil físico. GitHub Actions de WEB-AUTH-001 finalizó correctamente tras integrar la PR #11 en `develop`.
- La ejecución de GitHub Actions de la autenticación finalizó correctamente en la PR #11; la CI de TMDB-DOC-001 sigue **PENDIENTE** hasta abrir su Pull Request. Si se cambian las versiones de Better Auth, adaptador Prisma, Fastify, Prisma o PostgreSQL, repetir las pruebas de compatibilidad antes de integrar.

No implementar autenticación propia como sustituto ni alterar las decisiones aprobadas sin autorización.

## ADR-004 — Infraestructura y despliegue

**Estado: PARCIALMENTE APROBADO**

- Desarrollo local: Docker con PostgreSQL.
- No introducir microservicios ni Kubernetes.
- **PENDIENTE:** hosting, staging, producción, dominios, TLS, copias de seguridad, restauración y sus proveedores.

La aprobación de Docker local no autoriza a crear infraestructura remota.

## ADR-005 — Rankings

**Estado: PARCIALMENTE APROBADO**

Reglas iniciales aprobadas para rankings de películas:

- Región predeterminada: España.
- Ranking principal: Top 5.
- Películas recientes: estrenos de los últimos 90 días.
- Umbral inicial: mínimo de 100 votos.
- Orden: puntuación TMDB descendente; empate por número de votos descendente; empate restante por título ascendente.
- Si hay menos de cinco resultados elegibles, mostrar solo los disponibles.
- Mostrar fuente y criterios del ranking.

**PENDIENTE:** criterios de período, fecha, umbral y orden para rankings de series. No asumir que las reglas de películas se aplican a series.

## ADR-006 — Identidad visual

**Estado: PENDIENTE**

La paleta, tipografía y dirección visual definitivas todavía no se han aprobado. La interfaz seguirá en español y será responsive; cualquier propuesta visual de partida no constituye una decisión de identidad.

La implementación inicial de autenticación y primera navegación privada (WEB-AUTH-001) se desarrolló con prioridad **Mobile First**: diseño para anchos de 360–430 px, con controles táctiles cómodos, safe areas y navegación inferior en móvil; adaptación posterior a tablet y escritorio. Esta prioridad de implementación no aprueba ni cierra la identidad visual, la paleta ni la tipografía de ADR-006. La propuesta visual usada en esa implementación («CineTrack Moderno», tema oscuro) es solo una propuesta de partida; se revisará manualmente antes de tomar una decisión definitiva, por lo que ADR-006 permanece PENDIENTE. PWA, modo offline y notificaciones push no están incluidos y se evaluarán posteriormente.

## ADR-007 — Integración TMDB

**Estado: PARCIALMENTE APROBADO — decisiones arquitectónicas aprobadas; validación legal (TMDB-TERMS-001) PENDIENTE; implementación no iniciada**

### Contexto

PROD-011 y ADR-002 fijan TMDB como fuente externa de películas y series, consumida desde el servidor. El PRD exige idioma `es-ES` con fallback a datos originales. `docs/API_INTEGRATION.md` solo contenía un diseño orientativo y no existía una decisión sobre arquitectura, caché, contratos ni atribución. El uso previsto es un grupo cerrado, sin ingresos. Las condiciones oficiales de TMDB (API Terms of Use, revisadas el 2026-10-19) permiten la API de forma gratuita solo para uso no comercial con atribución, limitan la caché a 6 meses, prohíben crear «derivados» y prohíben su uso en aplicaciones o entrenamiento de ML/IA.

### Decisión (APROBADA)

- Arquitectura **React → Fastify → TMDB API v3**. El navegador nunca llama a TMDB con credenciales.
- La credencial (`TMDB_READ_ACCESS_TOKEN`, token de lectura Bearer) permanece **exclusivamente en el backend**.
- La integración es un **módulo de catálogo dentro de `apps/api`** (`apps/api/src/catalog/`). Sin microservicios, Redis ni bases de datos adicionales.
- **Consultas bajo demanda** en el MVP; no se persiste el catálogo completo ni se crean migraciones Prisma para TMDB-001.
- **Caché en memoria** con TTL limitado y siempre muy inferior al máximo oficial de 6 meses.
- **No se usa `stale-if-error`:** una entrada caducada nunca se sirve, aunque TMDB esté indisponible; en ese caso se devuelve un error controlado.
- **Contratos TypeScript compartidos en `packages/shared`** desde la primera implementación.
- Contratos HTTP: `GET /api/search`, `GET /api/media/movie/:tmdbId` y `GET /api/media/tv/:tmdbId`. No se modifican estos prefijos ni se añaden rutas alternativas sin aprobación.
- Películas y series desde el MVP; idioma preferido `es-ES`; región `ES` solo cuando el endpoint de TMDB la admita; fallback de metadatos cuando falten traducciones; sin filtrado por suscripciones a plataformas (PROD-010).
- Identidad del contenido: `source: 'tmdb'` + `type` (`movie|tv`) + `tmdbId`. El id numérico no identifica un título sin `type`.
- Para `type=all` se usa la **búsqueda múltiple** de TMDB filtrando personas.
- Las pruebas automatizadas usan **mocks y fixtures**; CI no usa credenciales reales.
- El contenido de TMDB no se usa para entrenamiento ni procesamiento con IA generativa sin autorización verificada.
- **División del trabajo:** la integración se ejecuta en seis tareas independientes, cada una en su rama `feature/*` (o `docs/*`) y con su PR a `develop`: `TMDB-DOC-001`, `TMDB-API-001`, `TMDB-API-002`, `TMDB-API-003`, `WEB-CATALOG-001` y `WEB-CATALOG-002`. **`docs/TASKS.md` es su registro oficial** (responsables, dependencias y criterios de aceptación, que no se duplican aquí). Que estén registradas no implica que estén implementadas.

### Justificación

- Un módulo en el monolito modular existente reutiliza los patrones de Fastify, sesión y configuración, y mantiene la operación sencilla para un MVP doméstico.
- La consulta bajo demanda con caché corta evita almacenar y conservar datos de TMDB y sus límites de caché, y cualquier posible cuestión de «derivados» asociada a un catálogo local.
- Rechazar datos caducados prioriza el cumplimiento de la política de caché y la simplicidad sobre la disponibilidad durante caídas de TMDB.
- `search/multi` mantiene una única paginación coherente para `type=all`.
- `packages/shared` evita derivas entre API y web en identidades y respuestas.

### Alternativas consideradas

| Alternativa                                                                        | Estado                 | Motivo                                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Búsqueda separada (`search/movie` + `search/tv`) con mezcla manual para `type=all` | Descartada             | Dos paginaciones independientes no se pueden fusionar de forma estable; ordenación artificial, más llamadas y más lógica propia.                          |
| Caché distribuida (Redis u otra)                                                   | Descartada             | Infraestructura adicional no justificada para un despliegue único; viola el alcance «sin Redis».                                                          |
| Persistencia completa del catálogo en PostgreSQL                                   | Descartada para el MVP | Obliga a sincronizar, caducar y borrar datos (límite de 6 meses), añade migraciones y aumenta el riesgo contractual.                                      |
| Proxy de imágenes en Fastify                                                       | Descartada             | Más ancho de banda y superficie de ataque (SSRF/abuso) y carga para la API; las imágenes se sirven desde la CDN oficial con URLs construidas en servidor. |
| `stale-if-error`                                                                   | Descartada             | Sirve datos caducados; fuera de la política aprobada.                                                                                                     |
| Llamadas desde el navegador a TMDB                                                 | Descartada             | Expondría la credencial.                                                                                                                                  |

### Consecuencias

- Cada consulta del usuario puede generar tráfico a TMDB; la caché y el rate limiting propio lo acotan. La caché se pierde al reiniciar el proceso y no se comparte entre instancias.
- Si TMDB cae y no hay entrada vigente, la funcionalidad de catálogo falla de forma recuperable; los datos propios (biblioteca, valoraciones, listas) no se ven afectados.
- Las respuestas de `type=all` pueden contener menos de 20 elementos por página y `totalResults`/`totalPages` reflejan la búsqueda múltiple de TMDB, que incluye personas filtradas.
- Las imágenes se cargan directamente desde la CDN de TMDB, por lo que la IP del navegador llega a TMDB.
- El tipo `type`+`tmdbId` queda como referencia estable para biblioteca, valoraciones, listas y rankings futuros.

### Riesgos

- TMDB no ofrece SLA y puede modificar o terminar el servicio o sus condiciones.
- Interpretación legal de «derivados» y de la normalización/caché (ver pendientes).
- Memoria de la caché en proceso: se acota con un número máximo de entradas.
- Que `packages/shared` requiera un ajuste de build para API y web (ver `docs/ARCHITECTURE.md`).

### Limitaciones

- Sin catálogo offline ni búsqueda sobre datos propios.
- Sin temporadas detalladas con episodios (el MVP solo sigue temporadas completas); la información de temporadas viaja dentro del detalle de serie.
- Rankings, descubrimiento, biblioteca, valoraciones y listas quedan fuera de este ADR y no se implementan en TMDB-001.

### Criterios que obligarían a revisar la decisión

- Uso comercial, cobro, ingresos, publicidad o apertura a usuarios públicos (requiere acuerdo comercial con TMDB).
- Cambio de las condiciones, límites o endpoints de TMDB, o su retirada.
- Despliegue con varias instancias o necesidad real de caché compartida.
- Necesidad de búsquedas o filtros que TMDB no ofrezca (persistencia local).
- Presión de carga o 429 frecuentes.
- Resolución negativa o restrictiva de TMDB-TERMS-001.
- Cambio de la decisión sobre IA o sobre `stale-if-error`.

### Cuestiones legales PENDIENTES (no aprobadas)

- **TMDB-TERMS-001:** validación del responsable sobre el uso previsto y las restricciones contractuales. La revisión de las condiciones citada en este ADR es un insumo técnico, no una interpretación jurídica aprobada.
- Compatibilidad de la normalización y la caché con la prohibición de «derivados».
- Redacción, ubicación y logos exactos de la atribución (los términos exigen el aviso de forma destacada; la FAQ menciona una sección «About»/créditos); verificar la versión vigente al implementar WEB-CATALOG-001.
- Si TMDB-TERMS-001 debe cerrarse antes de iniciar TMDB-API-001 o solo antes de usar credenciales reales fuera de desarrollo y de producción (ver `docs/TASKS.md`).
