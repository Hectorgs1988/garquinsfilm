# Modelo de datos lógico — propuesta

> Modelo conceptual, no esquema Prisma definitivo. Revisar según BD seleccionada.

- **User**: id, email único, password_hash / identidad gestionada por proveedor, display_name, avatar_url?, created_at, status.
- **Invitation**: id, email, token_hash, expires_at, invited_by, accepted_at?.
- **Media**: id, provider=`tmdb`, external_id, type=`movie|tv`, metadata cache?, updated_at. **Unique(provider, type, external_id)**.
- **LibraryEntry**: id, user_id, media_id, status, is_favorite, added_at, watched_at?, updated_at. **Unique(user_id,media_id)**.
- **Rating**: id, user_id, media_id, score (decimal(3,1)), comment?, updated_at. **Unique(user_id,media_id)**; CHECK 0<=score<=10.
- **SeasonProgress**: id, user_id, series_media_id, season_number, watched, watched_at?. **Unique(user_id,series_media_id,season_number)**. Sólo type=tv.
- **SharedList**: id, owner_id, name, description?, created_at, updated_at.
- **SharedListMember**: list_id, user_id, role=`owner|member`, joined_at. **Unique(list_id,user_id)**.
- **SharedListItem**: list_id, media_id, added_by, added_at. **Unique(list_id,media_id)**.

## Invariantes
- Estado depende del tipo de media. Película: pending/watched; serie: pending/watching/completed/dropped.
- Progreso de serie se computa sobre temporadas normales; season 0 excluida por defecto.
- Las operaciones de miembros y títulos de listas requieren control de acceso en backend.
- La eliminación de un usuario/lista requiere reglas explícitas de retención y borrado.
- Identificador numérico externo por sí solo NO identifica un título: incluir siempre `type`.
- La metadata procedente de TMDB no es de propiedad del usuario y su cache queda sujeta a condiciones de uso.

## Relaciones
`User 1—N LibraryEntry`, `User 1—N Rating`, `User 1—N SeasonProgress`; `Media 1—N LibraryEntry/Rating/SharedListItem`; `SharedList N—M User` por `SharedListMember`.
