# Modelo de datos lógico — propuesta

> Modelo conceptual; no es el esquema Prisma definitivo. PostgreSQL y Prisma están aprobados. Los detalles de Better Auth dependen de validar la compatibilidad de versiones con Fastify y Prisma.

- **User / entidades de autenticación:** Better Auth gestiona la identidad y las entidades de autenticación que requiera su integración. El modelo de aplicación se relaciona con el usuario autenticado; no duplicar ni sustituir el almacenamiento de credenciales de Better Auth.
- **Invitation:** id, email, token_hash, expires_at, invited_by, accepted_at?. Invitaciones de un solo uso; el proveedor/canal de envío sigue pendiente.
- **Media:** id, provider=`tmdb`, external_id, type=`movie|tv`, metadata cache?, updated_at. **Unique(provider, type, external_id)**.
- **LibraryEntry:** id, user_id, media_id, status, is_favorite, added_at, watched_at?, updated_at. **Unique(user_id, media_id)**.
- **Rating:** library_entry_id único, score (decimal(3,1)), comment?, updated_at. La valoración pertenece a una entrada de biblioteca; score entre 0,0 y 10,0 en incrementos de 0,1.
- **SeasonProgress:** id, user_id, series_media_id, season_number, watched, watched_at?. **Unique(user_id, series_media_id, season_number)**. Sólo aplica a `type=tv`.
- **SharedList:** id, owner_id, name, description?, created_at, updated_at.
- **SharedListMember:** list_id, user_id, role=`owner|member`, joined_at. **Unique(list_id, user_id)**.
- **SharedListItem:** list_id, media_id, added_by, added_at. **Unique(list_id, media_id)**.

## Invariantes

- La cuenta y las credenciales se gestionan con Better Auth una vez validada la compatibilidad de versiones.
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
