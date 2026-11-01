# Arquitectura de GarquinsFilm

## Estilo

Monorepositorio con frontend, API y contratos compartidos. El backend será un monolito modular; no se introducirán microservicios ni Kubernetes.

## Stack aprobado

- `apps/web`: React + TypeScript + Vite + Tailwind CSS.
- `apps/api`: Node.js + TypeScript + Fastify.
- Persistencia: PostgreSQL + Prisma.
- Monorepositorio: pnpm workspaces.
- Contratos compartidos: `packages/shared` para tipos y validaciones compartidas cuando corresponda.
- Pruebas: Vitest y Playwright.
- CI: GitHub Actions.
- Catálogo externo: TMDB API v3, accedido desde un módulo de catálogo del servidor (ADR-007).

La integración de Better Auth 1.7.11 y su adaptador Prisma 1.7.11 con Fastify 5.12.7 y Prisma 7.10.1 se probó localmente. Los modelos de autenticación y su migración versionada se validaron en una base PostgreSQL 17 aislada. La autenticación ya está integrada en `develop` mediante la PR #11 y GitHub Actions finalizó correctamente; cualquier cambio de estas versiones exige revalidación.

## Autenticación

Better Auth es responsable de email/contraseña y sesiones seguras. La integración core se implementó con Better Auth y `@better-auth/prisma-adapter` 1.7.11, Fastify 5.12.7 y Prisma 7.10.1; el puente HTTP, los modelos, la migración y los flujos se probaron con PostgreSQL efímero 17. La CI repite los tests; la implementación de autenticación se integró en `develop` mediante la PR #11 y GitHub Actions finalizó correctamente.

La API montará los endpoints de Better Auth bajo `/api/auth/*` mediante la integración HTTP catch-all adecuada para Fastify. Better Auth reutilizará el singleton Prisma Client de `apps/api`; no se crearán clientes ni pools duplicados. La configuración de base de datos y sus migraciones permanecerá dentro de `apps/api`.

El registro público estará deshabilitado. Solo se podrán crear cuentas aceptando una invitación válida emitida por un administrador. Las invitaciones se vinculan a un email normalizado, vencen a los 7 días y se consumen atómicamente una sola vez. La aceptación correcta no requiere verificación adicional del email.

Los roles globales se restringen a `admin` y `user` mediante enum PostgreSQL y se autorizan en el servidor. Ser propietario de una lista compartida es un permiso de esa lista, separado del rol global. El bootstrap inicial solo se ejecuta desde CLI con `NODE_ENV=development`, allowlist explícita y confirmación aleatoria vinculada a operación/destino/contenedor. El CLI verifica que la conexión PostgreSQL efectiva corresponde por IP interna al único contenedor activo `postgres` del proyecto Docker Compose local; contextos Docker remotos y discrepancias se rechazan. No existe endpoint HTTP ni este procedimiento se usa en staging/producción.

Los administradores pueden crear, listar y revocar invitaciones; la aceptación pública requiere token de alta entropía, email normalizado coincidente y estado vigente. Se almacena solo el hash. La invitación nace `PENDING_DELIVERY`, pasa a `ACTIVE` tras la aceptación del destinatario por SMTP y la activación queda persistida; esta aceptación SMTP no garantiza entrega final al buzón. Solo `ACTIVE` puede consumirse. La transición condicional a `CONSUMED` y la creación de User/Account ocurren en la misma transacción, evitando doble consumo concurrente. Una entrega fallida se marca `DELIVERY_FAILED` si PostgreSQL está disponible; en caso contrario queda `PENDING_DELIVERY`, que también es inutilizable. Si SMTP acepta el mensaje pero PostgreSQL falla antes de confirmar la activación, la API devuelve un error controlado y la invitación permanece no utilizable, salvo que la transacción de activación ya se hubiera confirmado pese a perderse su respuesta. No hay reintentos automáticos, colas ni regeneración automática. Una vez recuperado PostgreSQL, un administrador consulta el estado: si es `ACTIVE`, el token enviado corresponde a la activación confirmada; si es `PENDING_DELIVERY` o `DELIVERY_FAILED`, revoca esa invitación y emite otra nueva. El token anterior nunca se reactiva ni reutiliza. El adaptador runtime falla de forma segura si SMTP no está configurado. Un comando local, sujeto a las mismas validaciones de entorno/destino y confirmación interactiva única, permite mostrar tokens solo para pruebas.

La recuperación usa los endpoints Better Auth `POST /api/auth/request-password-reset` y `POST /api/auth/reset-password`; las respuestas de solicitud son genéricas, los enlaces expiran en una hora y son de un solo uso, y el cambio de contraseña revoca las sesiones existentes. Ante fallo de envío, se invalida la verificación temporal si la base de datos está disponible y se registra únicamente el tipo de error; las respuestas siguen siendo genéricas. No se desactivan CSRF ni comprobaciones de origen. Se limitan los intentos de autenticación/recuperación y no se registran contraseñas, cookies ni tokens. Cookies y sesiones deben configurarse de forma segura según el entorno. CORS y cualquier proxy de confianza se configurarán con orígenes/IPs explícitos, sin confiar indiscriminadamente en headers reenviados.

La API entrega invitaciones y enlaces de recuperación mediante una interfaz de correo independiente de negocio; el adaptador SMTP se configura mediante variables de entorno y en desarrollo puede usar Mailpit local. Se consideran entregados solo cuando el servidor SMTP acepta al destinatario, no cuando llega a su bandeja final. Los tests inyectan un remitente simulado. Los tokens se incluyen en fragmentos URL para evitar que el navegador los envíe en la petición de navegación. El frontend (WEB-AUTH-001) los lee del fragmento al cargar `/accept-invitation` o `/reset-password`, los retira de la barra de direcciones antes de montar la interfaz y los envía únicamente en el cuerpo de la petición a la API; no los guarda en almacenamiento del navegador. Los enlaces SMTP de invitación incluyen `email` y `token`; el CLI local puede generar enlaces con solo `token`, en cuyo caso el formulario pide el correo y la API valida ambos datos. El frontend consume la API Fastify y Better Auth mediante un cliente centralizado de mismo origen (proxy `/api` de Vite en desarrollo), con cookies de sesión HttpOnly gestionadas por Better Auth, y valida la sesión en servidor con `GET /api/me`. La interfaz es Mobile First: navegación inferior en móvil y lateral en escritorio. WEB-AUTH-001 está implementado, probado localmente e integrado en `develop` (PR #11); no hay E2E de navegador en CI. Better Auth genera tokens de recuperación con caducidad de una hora y un solo uso, y revoca las sesiones al restablecer contraseña. No se ha aprobado un proveedor remoto; producción no puede usar Mailpit ni un SMTP loopback.

## Estructura del monorepositorio

```text
apps/
  web/
  api/
packages/
  shared/
docs/
.github/
  agents/
  workflows/
```

La API será responsable de autorización, acceso a PostgreSQL y la integración con TMDB. `packages/shared` no contendrá acceso a la base de datos ni dependerá de modelos generados por Prisma.

El módulo `apps/api/src/season-progress` (SERIES-002) gestiona el progreso por temporadas de una entrada de serie: `SeasonProgress` es una relación 1:N con `LibraryEntry` (solo temporadas completadas), con contratos en `packages/shared/src/season-progress.ts`, validación estricta, servicio Prisma que serializa las escrituras por entrada con `SELECT … FOR UPDATE` y rutas `/api/library/:entryId/seasons`. No depende de TMDB; el porcentaje se calcula en SERIES-003 a partir del detalle del catálogo.

El módulo `apps/web/src/seasons` (SERIES-003) calcula el progreso en el cliente con una función pura (`season-progress.ts`): denominador = temporadas regulares con `episodeCount > 0` y sin estreno futuro (fecha nula con episodios cuenta); temporada 0, futuras y huérfanas quedan fuera del porcentaje; sin metadatos el progreso es indeterminado. «Marcar hasta esta temporada» usa un único `PATCH` (máx. 100, sin trocear). El progreso nunca modifica estado, favoritos ni valoración, y la biblioteca solo consulta el progreso guardado al abrir el diálogo de una serie (no por tarjeta) y no pide metadatos de catálogo mientras TMDB-TERMS-001 esté pendiente: ahí el progreso es indeterminado y el porcentaje solo se muestra en la ficha.

El módulo `apps/api/src/ratings` gestiona la valoración privada de una entrada existente de biblioteca. `Rating` es un recurso opcional 1:1 con `LibraryEntry`, con contratos compartidos en `packages/shared`; las rutas anidadas no exponen ratings de otros usuarios ni incorporan funciones sociales. El aislamiento, las restricciones de persistencia y el protocolo HTTP se especifican en `docs/DATA_MODEL.md`, `docs/API_INTEGRATION.md` y `docs/SECURITY.md`.

## Límites y flujo de datos

```text
React web → API Fastify → módulos de dominio → Prisma/PostgreSQL
                                      └──────→ módulo de catálogo → TMDB API v3
```

La clave TMDB se mantiene en el servidor. El navegador no realiza llamadas que requieran un secreto. Los datos del catálogo se separan de los datos privados de cada usuario; la caché depende de los términos de TMDB.

## Módulo de catálogo TMDB (ADR-007 — diseño aprobado; cliente, búsqueda y detalle implementados localmente; rama de detalle pendiente de revisión y CI)

Módulo dentro del monolito `apps/api`; sin microservicios, Redis ni bases de datos adicionales. Ver contratos, errores, caché y condiciones de TMDB en `docs/API_INTEGRATION.md`.

```text
apps/api/src/catalog/
  tmdb.config.ts      # [implementado, TMDB-API-001] lectura y validación de TMDB_* (patrón de auth/config.ts)
  tmdb.client.ts      # [implementado] cliente HTTP de TMDB: Bearer, plazo garantizado, host fijo, reintentos acotados, cuerpo limitado
  tmdb.errors.ts      # [implementado] errores tipados del cliente y su traducción a HTTP
  tmdb.provider.ts    # [implementado] proveedor perezoso del cliente (app.tmdb.get())
  catalog.search.ts  # búsqueda, con normalización y validación en módulos separados
  catalog.detail.ts  # detalle enriquecido, con normalización y validación en módulos separados
  catalog.cache.ts    # caché en memoria con TTL y límite de entradas
  catalog.routes.ts  # plugin Fastify: validación explícita, sesión, rate limit
packages/shared/      # contratos TypeScript del catálogo (sin lógica de servidor)
```

**Responsabilidades**

- `tmdb.config.ts`: valida `TMDB_READ_ACCESS_TOKEN`, `TMDB_TIMEOUT_MS`, `TMDB_DEFAULT_LANGUAGE` y `TMDB_DEFAULT_REGION`. Se evalúa solo al activar el catálogo: su ausencia no impide arrancar la API ni ejecutar las pruebas de autenticación.
- `tmdb.client.ts`: único punto que habla con TMDB. Host y esquema fijos (`https://api.themoviedb.org/3`), sin URL base configurable ni URLs aportadas por el usuario (prevención de SSRF). Cabecera `Authorization: Bearer`, plazo por intento garantizado (carrera entre la operación y un temporizador, además de `AbortSignal`, de modo que no depende de que el transporte lo respete), lectura incremental del cuerpo limitada a 2 MB, redirecciones rechazadas, reintentos acotados solo en GET idempotentes y respuestas tipadas. No registra token ni consulta completa.
- `tmdb.errors.ts`: errores propios (no encontrado, límite, no disponible, timeout, respuesta inválida) sin datos internos de TMDB.
- `catalog.search.ts` y `catalog.detail.ts`: orquestan caché y cliente; elige `search/movie`, `search/tv` o `search/multi` (filtrando personas); normaliza a los contratos compartidos (nulos en lugar de ceros, fallback de idioma, `isSpecial` para la temporada 0) y construye URLs de imagen de `image.tmdb.org` con tamaños de una lista permitida.
- `catalog.cache.ts`: caché en memoria con TTL y tope de entradas; la lectura verifica la expiración y nunca devuelve entradas caducadas (sin `stale-if-error`). No guarda credenciales.
- `catalog.routes.ts`: plugin Fastify con las tres rutas aprobadas. Exige sesión Better Auth con el patrón de `auth/routes.ts` (`authInstance.api.getSession`, 401 genérico y `logSafeError`), valida mediante los módulos de validación (propiedades desconocidas rechazadas, página 1–500), aplica `config.rateLimit` por ruta y traduce errores a 400/401/404/429/502/503/504 con cuerpo `{ error }`.

**Inyección y pruebas.** `buildApp` acepta (TMDB-API-001, implementado en rama, pendiente de revisión) la dependencia opcional `tmdbClient`, igual que `database`, `invitationDelivery` y `auth`, y expone `app.tmdb.get()`: un proveedor perezoso que devuelve el cliente inyectado o lo crea desde el entorno en la primera llamada. Sin token, la API arranca y autentica con normalidad y solo `get()` falla con `TmdbConfigError` (503 público). TMDB-API-002/003 envuelven este cliente con servicios de búsqueda y detalle, inicializados de forma perezosa desde las rutas. Las pruebas inyectan un cliente TMDB simulado con fixtures; CI no usa credenciales ni red real.

**Contratos compartidos (`packages/shared`).** Contiene solo tipos y constantes sin dependencias de servidor ni de Prisma (identidad `{ source, type, tmdbId }`, resultados de búsqueda, detalles, temporadas, límites de validación). Estado actual (TMDB-API-001, en rama pendiente de revisión): `packages/shared` compila con `tsc` (NodeNext, declaraciones) a `dist`, expone `types`/`default` en `exports` y lo consumen `apps/api` (NodeNext) y `apps/web` (Vite/Bundler) como `workspace:*`; los scripts raíz `typecheck`, `test` y `dev` ejecutan antes `build:shared` (una sola vez, para evitar escrituras concurrentes en `dist`) y `build` respeta el orden topológico de pnpm. Ejecutar scripts sueltos de un consumidor requiere un `dist` de `shared` actualizado. La vía inicialmente propuesta fue:

- Declarar `@garquinsfilm/shared` como dependencia `workspace:*` en `apps/api` y `apps/web`.
- Compilar `packages/shared` a `dist` con declaraciones y exponer `types`/`default` en su `exports`, de modo que la API (ESM/NodeNext) importe JavaScript y tipos ya compilados y no un `.ts` fuera de su `rootDir`, y Vite/TypeScript (Bundler) resuelvan el mismo paquete.
- Ejecutar el build de `packages/shared` antes de `typecheck`, `test` y `build` de sus consumidores (en el orden topológico de pnpm y en CI), siguiendo el precedente de `prisma:generate`.
- Importar con rutas de paquete (`@garquinsfilm/shared`), sin rutas relativas entre paquetes. Sin dependencias nuevas salvo necesidad justificada y aprobada.

Si esa vía no resulta viable, se propondrá una alternativa a revisión antes de implementar; la decisión aprobada es el uso de `packages/shared`, no su mecanismo de build.

**Interfaz (futura, WEB-CATALOG-001/002).** El frontend consume únicamente `/api/search` y `/api/media/...` mediante el cliente centralizado `apps/web/src/api.ts`, sin ninguna credencial de TMDB. Las imágenes se cargan desde la CDN con las URLs devueltas por la API, con marcador de posición si son `null`. La atribución de TMDB (logo oficial menos prominente que el de GarquinsFilm y aviso) debe ser visible en la interfaz, según `docs/API_INTEGRATION.md`.

## Entornos

- **Desarrollo local:** Docker con PostgreSQL; aplicaciones web y API ejecutadas localmente.
- **Staging y producción:** hosting, topología, dominios, TLS, copias de seguridad y proveedores **pendientes**.
- No crear infraestructura remota ni despliegues automáticos hasta aprobar las decisiones de hosting.

## Calidad y operación

- GitHub Actions validará instalación reproducible, lint, tipos, pruebas y build conforme se incorporen los scripts.
- Vitest cubrirá lógica y pruebas de módulos; Playwright cubrirá recorridos E2E seleccionados.
- Las migraciones de Prisma deben ser reproducibles y revisarse antes de aplicarse a entornos compartidos.
- Los logs no deben contener secretos, contraseñas, cookies, tokens de sesión/invitación ni datos personales innecesarios.
- La API valida entradas y aplica autorización en el servidor para biblioteca, valoraciones, progreso y listas.

## Pendientes relacionados

- GitHub Actions de la autenticación (invitaciones/bootstrap, recuperación y WEB-AUTH-001) finalizó correctamente tras integrar la PR #11 en `develop`. La CI de TMDB-DOC-001 sigue pendiente hasta abrir su Pull Request.
- La integración SMTP local para invitaciones y recuperación de contraseña está implementada y probada con Mailpit y un remitente simulado. Los formularios frontend de aceptación de invitación y restablecimiento (WEB-AUTH-001) están implementados, probados localmente e integrados en `develop` (PR #11). QA validó localmente el envío SMTP real de invitaciones desde `POST /api/admin/invitations` hasta Mailpit y la aceptación (PostgreSQL temporal, cuentas ficticias); no equivale a la entrega con un proveedor de producción. Siguen pendientes el proveedor de correo para producción y las pruebas en dispositivo móvil físico.
- Mejora futura: interfaz de administración para consultar y gestionar invitaciones `PENDING_DELIVERY` y `DELIVERY_FAILED`; el procedimiento actual de revisión, revocación y nueva emisión es manual.
- Proveedor de correo remoto; Mailpit local y remitente simulado en tests sí están aprobados.
- Hosting de staging y producción, TLS, dominios y estrategia de backups.
- Condiciones TMDB (TMDB-TERMS-001): validación del uso previsto, compatibilidad con la cláusula de «derivados» y ubicación exacta de la atribución. Arquitectura del catálogo aprobada en ADR-007; implementación pendiente (TMDB-API-001/002/003, WEB-CATALOG-001/002).
- Identidad visual definitiva.

### Implementación local de catálogo — TMDB-API-003 (2026-10-25)

Actualiza la estructura propuesta anteriormente: `catalog.routes.ts` registra búsqueda
y detalles, `catalog.search.ts`/`catalog.detail.ts` orquestan cliente y caché,
`catalog.normalize.ts`/`catalog.detail.normalize.ts` normalizan `unknown` y los módulos
`catalog.validation.ts`/`catalog.detail.validation.ts` validan entradas explícitamente.
No se añadió `catalog.service.ts` ni infraestructura nueva. El detalle solicita
`credits,videos,watch/providers` con `append_to_response` y valida la identidad recibida;
los contratos compartidos incluyen reparto, directores/creadores, vídeos y proveedores ES.
Cachés independientes de búsqueda y detalle, TTL 5 minutos, LRU 500 entradas y 20 cargas
simultáneas distintas por caché; solo metadatos, sin identidad de usuario ni credenciales.
Autenticación Better Auth antes de validar/consultar caché o inicializar el cliente.
El detalle completo, incluidos anexos, se normaliza y cachea conjuntamente.
Implementado localmente en `feature/tmdb-details`, pendiente de revisión y CI.
No se activa TMDB real ni se cierra TMDB-TERMS-001. Véase contrato actualizado en
`API_INTEGRATION.md`; la interfaz del modal sigue en WEB-CATALOG-002.
