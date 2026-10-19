# Modelo de datos lógico — propuesta

> Modelo conceptual; PostgreSQL y Prisma están aprobados. Los modelos de autenticación e invitación están versionados en Prisma; los modelos de negocio siguen fuera de las migraciones actuales.

- **User:** identidad gestionada por Better Auth. El rol global usa el enum `GlobalRole` (`admin|user`) y solo se asigna en servidor. El alta normal ocurre al aceptar una invitación; el primer administrador se crea mediante el comando local controlado.
- **Session:** sesiones gestionadas por Better Auth y relacionadas con User; proteger tokens y metadatos sensibles.
- **Account:** métodos de autenticación gestionados por Better Auth y relacionados con User. No duplicar credenciales ni almacenar contraseñas en modelos propios.
- **Verification:** registros temporales gestionados por Better Auth. Los tokens de recuperación caducan en una hora y se consumen una sola vez. No exigir verificación adicional del email después de aceptar una invitación válida.
- **Invitation (implementado):** id, email normalizado, `tokenHash`, `status`, `expiresAt`, `createdByUserId`, `consumedAt`, `consumedUserId` y `revokedAt`. `status` recorre `PENDING_DELIVERY → ACTIVE → CONSUMED`, con estados terminales `DELIVERY_FAILED` y `REVOKED`. Solo se persiste SHA-256 de un token aleatorio de 32 bytes; caduca a los 7 días. Solo `admin` puede emitir, listar y revocar; la aceptación exige estado `ACTIVE` y crea usuario/cuenta credential en una transacción atómica.
- **AuditEvent (implementado):** acción, actor opcional, id de objetivo opcional y fecha; no contiene token, contraseña ni correo de invitación.
- **Media:** id, provider=`tmdb`, external_id, type=`movie|tv`, metadata cache?, updated_at. **Unique(provider, type, external_id)**.
- **LibraryEntry:** id, user_id, media_id, status, is_favorite, added_at, watched_at?, updated_at. **Unique(user_id, media_id)**.
- **Rating:** library_entry_id único, score (decimal(3,1)), comment?, updated_at. La valoración pertenece a una entrada de biblioteca; score entre 0,0 y 10,0 en incrementos de 0,1.
- **SeasonProgress:** id, user_id, series_media_id, season_number, watched, watched_at?. **Unique(user_id, series_media_id, season_number)**. Sólo aplica a `type=tv`.
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
- El estado depende del tipo de medio. Película: `pending|watched`; serie: `pending|watching|completed|dropped`.
- Una valoración solo puede existir para un título presente en la biblioteca personal; su unicidad se deriva de la entrada única por usuario y medio.
- El valor de una nota tiene un decimal y está en el rango inclusivo 0,0–10,0.
- No se registran re-visionados ni múltiples entradas del mismo medio para el mismo usuario en el MVP.
- El progreso de series se computa sobre temporadas normales; temporada 0/especiales se excluyen del denominador.
- Los miembros pueden añadir y retirar títulos de una lista; solo el propietario gestiona miembros y elimina la lista.
- Las operaciones de listas requieren control de acceso en backend.
- La eliminación de un usuario/lista requiere reglas explícitas de retención y borrado, todavía pendientes.
- El identificador externo numérico por sí solo no identifica un título: incluir siempre `type`.
- La metadata TMDB no es propiedad del usuario y su caché está sujeta a las condiciones del servicio.

## Relaciones

`User 1—N LibraryEntry`, `LibraryEntry 0..1—1 Rating`, `User 1—N SeasonProgress`; `Media 1—N LibraryEntry/SharedListItem`; `SharedList N—M User` por `SharedListMember`.
