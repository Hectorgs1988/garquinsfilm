# Modelo de datos lógico — propuesta

> Modelo conceptual alineado al estado de RATINGS-002. PostgreSQL y Prisma están aprobados; autenticación, invitaciones y biblioteca tienen migraciones versionadas. Ratings están integrados; el progreso por temporadas se implementa en SERIES-002 (backend) y las listas continúan siendo un diseño pendiente de implementación.

- **User:** identidad gestionada por Better Auth. El rol global usa el enum `GlobalRole` (`admin|user`) y solo se asigna en servidor. El alta normal ocurre al aceptar una invitación; el primer administrador se crea mediante el comando local controlado.
- **Session:** sesiones gestionadas por Better Auth y relacionadas con User; proteger tokens y metadatos sensibles.
- **Account:** métodos de autenticación gestionados por Better Auth y relacionados con User. No duplicar credenciales ni almacenar contraseñas en modelos propios.
- **Verification:** registros temporales gestionados por Better Auth. Los tokens de recuperación caducan en una hora y se consumen una sola vez. No exigir verificación adicional del email después de aceptar una invitación válida.
- **Invitation (implementado):** id, email normalizado, `tokenHash`, `status`, `expiresAt`, `createdByUserId`, `consumedAt`, `consumedUserId` y `revokedAt`. `status` recorre `PENDING_DELIVERY → ACTIVE → CONSUMED`, con estados terminales `DELIVERY_FAILED` y `REVOKED`. Solo se persiste SHA-256 de un token aleatorio de 32 bytes; caduca a los 7 días. Solo `admin` puede emitir, listar y revocar; la aceptación exige estado `ACTIVE` y crea usuario/cuenta credential en una transacción atómica.
- **AuditEvent (implementado):** acción, actor opcional, id de objetivo opcional y fecha; no contiene token, contraseña ni correo de invitación.
- **Media (biblioteca):** id, `source=tmdb`, `type=movie|tv`, `tmdbId` entero positivo. **Unique(source, type, tmdbId)**. Solo mantiene la identidad externa; no persiste metadatos editoriales ni depende de TMDB.
- **LibraryEntry:** id, user_id, media_id, `status=PENDING|WATCHING|COMPLETED|ABANDONED`, `is_favorite`, `added_at`, `updated_at`, `completed_at?`. **Unique(user_id, media_id)**. User se elimina en cascada; Media usa `RESTRICT`.
- **Rating (RATINGS-002):** `libraryEntryId` único, `scoreTenths Int?` (0–100), `review String?`, `containsSpoilers`, `createdAt`, `updatedAt`. Pertenece a una entrada de biblioteca existente; no duplica usuario ni identidad de contenido. La API convierte las décimas enteras a `score` numérico 0,0–10,0.
- **SeasonProgress (SERIES-002, implementado):** `id`, `libraryEntryId`, `seasonNumber Int` (0–9999) y `completedAt` (fijado por el servidor). **Unique(libraryEntryId, seasonNumber)**; FK a `LibraryEntry` con `ON DELETE CASCADE`. Tabla `season_progress`. Solo se persisten las temporadas **completadas**: la fila significa «completada» y su ausencia «pendiente» (sin booleano `completed`, sin `updatedAt`, sin historial). Solo aplica a entradas cuyo `Media.type=tv`. Sustituye al diseño conceptual anterior (`user_id`, `series_media_id`, `watched`, `watched_at`) por decisión SERIES-001: el progreso pertenece a `LibraryEntry`, no a `User` ni `Media`.
- **SharedList:** id, owner_id, name, description?, created_at, updated_at.
- **SharedListMember:** list_id, user_id, role=`owner|member`, joined_at. **Unique(list_id, user_id)**. Este rol de pertenencia y la propiedad de la lista son independientes del rol global `admin|user`.
- **SharedListItem:** list_id, media_id, added_by, added_at. **Unique(list_id, media_id)**.

## Invariantes

- Better Auth gestiona identidad, sesiones, cuentas de autenticación y verificaciones.
- Los roles globales solo se asignan en el servidor; nunca se aceptan como autoridad desde el cliente.
- La base de datos restringe los roles globales mediante `GlobalRole`; el propietario/rol de miembro en una lista es independiente.
- La aceptación de invitación comprueba email normalizado, hash, caducidad y estado `ACTIVE`; la transición a `CONSUMED` y la creación de usuario/cuenta son atómicas y excluyen consumo concurrente.
- Una invitación solo pasa de `PENDING_DELIVERY` a `ACTIVE` después de que el servidor SMTP acepte al destinatario y PostgreSQL confirme la activación. Si PostgreSQL falla antes de confirmar, la API devuelve un error controlado y la invitación permanece no utilizable, excepto cuando el commit sí se confirmó y solo se perdió la respuesta. No hay reintentos automáticos. Tras recuperar PostgreSQL, un administrador consulta el estado: `ACTIVE` conserva la invitación enviada; `PENDING_DELIVERY` o `DELIVERY_FAILED` se revoca manualmente antes de emitir una invitación nueva. El token anterior nunca se reactiva ni reutiliza.
- La propiedad/rol de miembro en una lista no confiere ni requiere un rol global concreto.
- Películas y series usan los mismos estados `PENDING|WATCHING|COMPLETED|ABANDONED`; el estado inicial es `PENDING`.
- `completedAt` es obligatorio si y solo si el estado es `COMPLETED`. Entrar en ese estado asigna la fecha; salir la limpia; volver a completado después asigna una fecha nueva. La base de datos y el servicio hacen cumplir la coherencia.
- Favoritos son independientes del estado. Cambiar estado no cambia `isFavorite`.
- Una valoración solo puede existir para un título presente en la biblioteca personal; su unicidad se deriva de la entrada única por usuario y medio.
- Una puntuación ausente es `null`; cero es una puntuación válida. El valor público tiene precisión exacta de 0,1 y rango inclusivo 0,0–10,0.
- La reseña es texto plano de hasta 2.000 puntos de código Unicode; se normalizan saltos CRLF/CR a LF y espacios Unicode de los extremos. La reseña vacía equivale a `null`; no se interpreta HTML ni Markdown.
- Rating requiere puntuación o reseña. `containsSpoilers` solo puede ser verdadero cuando existe una reseña. PostgreSQL comprueba rango, presencia, texto no blanco, longitud, coherencia de spoilers, unicidad y FK con `ON DELETE CASCADE`.
- Eliminar `LibraryEntry` elimina su Rating, pero no elimina Media. Modificar Rating no cambia `LibraryEntry.updatedAt`, estado ni favorito.
- Las puntuaciones y reseñas son privadas en RATINGS-002; no hay relación pública ni endpoints para obtenerlas por usuario o contenido global.
- No se crea otra entrada, historial ni contador al volver a ver un contenido; cambiar de `COMPLETED` a `WATCHING` está permitido y una nueva transición a `COMPLETED` actualiza `completedAt`.
- El progreso de series se computa sobre temporadas normales; temporada 0/especiales se excluyen del denominador. El cálculo del porcentaje **no se hace en el backend** (SERIES-003): la API solo conoce las temporadas completadas.
- SeasonProgress: PostgreSQL comprueba `seasonNumber BETWEEN 0 AND 9999`, unicidad por entrada y temporada y FK con cascada. El máximo de **500 temporadas completadas por entrada** y la restricción «solo series» las hace cumplir el servicio dentro de una transacción que bloquea la fila de `LibraryEntry` (`SELECT … FOR UPDATE`), por lo que no hay carreras de conteo ni violaciones de FK si la entrada se elimina durante la operación. No se añaden triggers.
- Marcar o desmarcar temporadas no modifica `LibraryEntry.status`, `completedAt`, `updatedAt`, `isFavorite` ni Rating. Eliminar `LibraryEntry` elimina su progreso por cascada. No se almacenan títulos, pósteres ni sinopsis de temporadas.
- Los miembros pueden añadir y retirar títulos de una lista; solo el propietario gestiona miembros y elimina la lista.
- Las operaciones de listas requieren control de acceso en backend.
- La eliminación de un usuario/lista requiere reglas explícitas de retención y borrado, todavía pendientes.
- El identificador externo numérico por sí solo no identifica un título: incluir siempre `type`.
- La metadata TMDB no es propiedad del usuario y su caché está sujeta a las condiciones del servicio.
- **Separación de datos del catálogo (ADR-007 y LIBRARY-001):** (1) _metadatos externos de TMDB_ no son fuente de verdad propia; (2) `source='tmdb'` + `type` + `tmdbId` identifica el contenido; (3) la biblioteca y otros datos propios no dependen de TMDB; (4) biblioteca, valoraciones y listas referencian `Media` y no copian el catálogo. Las respuestas permiten `media: null`.
- La preferencia grid/list pertenece al cliente y se guarda en `localStorage`; no se modela en PostgreSQL ni tiene endpoint.
- Índices de biblioteca: `(user_id, added_at)`, `(user_id, updated_at)`, `(user_id, status)` y `(user_id, is_favorite)`.
- No se persiste el catálogo completo de TMDB. La caché de TMDB (memoria o, en el futuro, `Media.metadata`) debe expirar y no superar el máximo oficial de 6 meses; el MVP usa TTL de minutos a horas en memoria (`docs/API_INTEGRATION.md`).
- Las ausencias de TMDB (imágenes, fechas, votos) se representan como `null`; una puntuación ausente nunca se almacena ni muestra como 0.

## Relaciones

`User 1—N LibraryEntry`, `LibraryEntry 0..1—1 Rating`, `User 1—N SeasonProgress`; `Media 1—N LibraryEntry/SharedListItem`; `SharedList N—M User` por `SharedListMember`.
