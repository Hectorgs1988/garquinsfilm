# Modelo de datos lógico — propuesta

> Modelo conceptual; no es el esquema Prisma definitivo. PostgreSQL y Prisma están aprobados. La integración efectiva de Better Auth depende de validar en ejecución las versiones exactas, su adaptador Prisma y el puente HTTP Fastify.

- **User:** identidad gestionada por Better Auth. Incluirá un rol global `admin|user`, asignado exclusivamente por lógica de servidor. El alta normal se produce mediante invitación aceptada; el primer administrador se crea con un procedimiento local controlado.
- **Session:** sesiones gestionadas por Better Auth y relacionadas con User; proteger tokens y metadatos sensibles.
- **Account:** métodos de autenticación gestionados por Better Auth y relacionados con User. No duplicar credenciales ni almacenar contraseñas en modelos propios.
- **Verification:** registros de verificación gestionados por Better Auth para los flujos habilitados. No exigir verificación adicional del email después de aceptar una invitación válida.
- **Invitation:** id, email normalizado, token_hash, expires_at (7 días desde su emisión), invited_by (administrador), accepted_at? y, si hace falta para integridad/auditoría, user_id aceptante. El token de alta entropía se almacena solo como hash; aceptación única, atómica y protegida ante concurrencia. Solo `admin` puede emitir invitaciones.
- **Media:** id, provider=`tmdb`, external_id, type=`movie|tv`, metadata cache?, updated_at. **Unique(provider, type, external_id)**.
- **LibraryEntry:** id, user_id, media_id, status, is_favorite, added_at, watched_at?, updated_at. **Unique(user_id, media_id)**.
- **Rating:** library_entry_id único, score (decimal(3,1)), comment?, updated_at. La valoración pertenece a una entrada de biblioteca; score entre 0,0 y 10,0 en incrementos de 0,1.
- **SeasonProgress:** id, user_id, series_media_id, season_number, watched, watched_at?. **Unique(user_id, series_media_id, season_number)**. Sólo aplica a `type=tv`.
- **SharedList:** id, owner_id, name, description?, created_at, updated_at.
- **SharedListMember:** list_id, user_id, role=`owner|member`, joined_at. **Unique(list_id, user_id)**. Este rol de pertenencia y la propiedad de la lista son independientes del rol global `admin|user`.
- **SharedListItem:** list_id, media_id, added_by, added_at. **Unique(list_id, media_id)**.

## Invariantes

- Better Auth gestiona identidad, sesiones, cuentas de autenticación y verificaciones, una vez validada la integración.
- Los roles globales solo se asignan en el servidor; nunca se aceptan como autoridad desde el cliente.
- La aceptación de invitación comprueba email normalizado, hash, caducidad y estado no consumido; la escritura debe impedir atómicamente el uso concurrente.
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
