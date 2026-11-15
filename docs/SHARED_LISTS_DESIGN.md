# Diseño de listas compartidas (LIST-001)

> Estado: **propuesta, pendiente de aprobación**. Desarrolla el apartado 7 del documento
> funcional y cierra lo que allí quedaba «pendiente de especificación». Sustituye al
> esbozo conceptual de `SharedList` en `DATA_MODEL.md`.

## 1. Qué resuelve

Una lista es una colección de títulos con nombre propio, independiente de la biblioteca
personal. Su dueño puede abrirla a otras personas de la instancia, en solo lectura o
dejándoles añadir y quitar títulos.

Lo aprobado en el documento funcional se da por cerrado y no se discute aquí: tres
modalidades, permisos de lector y editor, títulos tomados del catálogo, sin duplicados,
sin efecto sobre las bibliotecas individuales, orden manual persistente y ordenaciones
automáticas por título, fecha de incorporación y puntuación.

## 2. Modelo de datos

### `MediaList` (tabla `media_list`)

| Campo         | Tipo        | Notas                                      |
| ------------- | ----------- | ------------------------------------------ |
| `id`          | `String`    | Clave primaria                             |
| `ownerId`     | `String`    | FK a `user`, `ON DELETE CASCADE`           |
| `name`        | `String`    | 1–80 caracteres, NFC, sin controles        |
| `description` | `String?`   | Hasta 300 caracteres                       |
| `createdAt`   | `DateTime`  |                                            |
| `updatedAt`   | `DateTime`  | Cambia con nombre, descripción y contenido |

`CHECK` en PostgreSQL para las longitudes, como en `user_profile`.

### `MediaListMember` (tabla `media_list_member`)

| Campo     | Tipo                | Notas                               |
| --------- | ------------------- | ----------------------------------- |
| `listId`  | `String`            | FK a `media_list`, cascada          |
| `userId`  | `String`            | FK a `user`, cascada                |
| `role`    | `READER \| EDITOR`  | Enum `MediaListRole`                |
| `addedAt` | `DateTime`          |                                     |

Clave primaria compuesta `(listId, userId)`.

**El propietario no tiene fila aquí.** Su condición vive en `MediaList.ownerId`, que es
la única fuente de verdad. Esto corrige el esbozo de `DATA_MODEL.md`, donde el rol
`owner` convivía con la columna `owner_id` y permitía estados contradictorios: una lista
sin propietario, o con dos. Un `CHECK` impide además que el propietario figure como
miembro de su propia lista.

### `MediaListItem` (tabla `media_list_item`)

| Campo       | Tipo       | Notas                                    |
| ----------- | ---------- | ---------------------------------------- |
| `id`        | `String`   | Clave primaria                           |
| `listId`    | `String`   | FK a `media_list`, cascada               |
| `mediaId`   | `String`   | FK a `media`, `RESTRICT` como en biblioteca |
| `addedById` | `String?`  | FK a `user`, `ON DELETE SET NULL`        |
| `position`  | `Int`      | Orden manual, empezando en 1             |
| `addedAt`   | `DateTime` |                                          |

`UNIQUE(listId, mediaId)` cumple la regla de no duplicados. `UNIQUE(listId, position)`
diferido garantiza que el orden manual no tenga huecos ni empates.

`addedById` es opcional a propósito: si alguien se da de baja, sus aportaciones siguen en
las listas de los demás y solo se pierde la autoría.

## 3. Las modalidades se deducen, no se guardan

El documento funcional describe tres modalidades. Guardarlas en una columna obliga a
mantenerlas en coherencia con la tabla de miembros, y toda discrepancia es un error
silencioso. Se calculan al responder:

| Miembros                  | Modalidad          |
| ------------------------- | ------------------ |
| Ninguno                   | `personal`         |
| Todos lectores            | `shared`           |
| Al menos un editor        | `collaborative`    |

Ascender a un miembro a editor convierte la lista en colaborativa sin ningún paso extra,
y quitar al último editor la devuelve a compartida. Esto resuelve el «cambio entre
modalidades» que quedaba pendiente: no existe tal operación, solo gestión de miembros.

## 4. Permisos

| Acción                                | Propietario | Editor | Lector | Sin acceso |
| ------------------------------------- | ----------- | ------ | ------ | ---------- |
| Ver la lista y sus títulos            | sí          | sí     | sí     | no         |
| Añadir y quitar títulos               | sí          | sí     | no     | no         |
| Reordenar manualmente                 | sí          | sí     | no     | no         |
| Cambiar nombre y descripción          | sí          | no     | no     | no         |
| Gestionar miembros y sus permisos     | sí          | no     | no     | no         |
| Eliminar la lista                     | sí          | no     | no     | no         |

Se aplican en el servidor en todas las rutas, incluidas las de lectura individual. Quien
no tiene acceso recibe **404**, no 403: un 403 confirmaría que la lista existe.

Retirar a alguien surte efecto en su siguiente petición, sin sesiones que invalidar,
porque el permiso se comprueba en cada llamada.

## 5. Orden

`position` son enteros consecutivos desde 1. Mover un título reasigna las posiciones del
tramo afectado dentro de una transacción que bloquea la lista con `SELECT … FOR UPDATE`,
igual que hace el progreso por temporadas. Con el tope de títulos por lista que se fija
más abajo, reindexar es más simple que las posiciones fraccionarias y no acumula deriva.

Las ordenaciones automáticas son un parámetro de consulta y **nunca tocan `position`**:
el orden manual guardado sigue intacto al volver a él.

| `sortBy`  | Criterio                                            |
| --------- | --------------------------------------------------- |
| `manual`  | `position` ascendente. Valor por defecto            |
| `title`   | Título del catálogo, alfabético en español          |
| `addedAt` | Fecha de incorporación                              |
| `score`   | Puntuación personal de quien consulta, descendente  |

Sobre `score`, que el documento funcional dejaba por documentar: se usa **la nota de
quien está mirando la lista**, no la de TMDB ni la del propietario, porque una lista
compartida no tiene una puntuación común. Los títulos que esa persona no haya puntuado
van **al final**, entre ellos por fecha de incorporación. Así cada participante ve la
misma lista ordenada según su propio criterio sin alterar nada para los demás.

## 6. API

| Método y ruta                                | Quién         | Qué hace                               |
| -------------------------------------------- | ------------- | -------------------------------------- |
| `GET /api/lists`                              | sesión        | Listas propias y compartidas conmigo   |
| `POST /api/lists`                             | sesión        | Crear                                  |
| `GET /api/lists/:id`                          | con acceso    | Lista con sus títulos                  |
| `PATCH /api/lists/:id`                        | propietario   | Nombre y descripción                   |
| `DELETE /api/lists/:id`                       | propietario   | Eliminar                               |
| `POST /api/lists/:id/items`                   | editor        | Añadir un título del catálogo          |
| `DELETE /api/lists/:id/items/:itemId`         | editor        | Quitar un título                       |
| `PATCH /api/lists/:id/items/:itemId/position` | editor        | Mover a una posición                   |
| `GET /api/lists/:id/members`                  | con acceso    | Participantes y sus permisos           |
| `PUT /api/lists/:id/members/:userId`          | propietario   | Añadir o cambiar permiso               |
| `DELETE /api/lists/:id/members/:userId`       | propietario   | Retirar acceso                         |
| `GET /api/users`                              | sesión        | Cuentas a las que invitar              |

`GET /api/users` existe solo para el selector de invitación y devuelve **id y nombre
visible, nada más**: ni correo, ni rol, ni fechas. Es la consecuencia de elegir el
desplegable con todas las cuentas; en una instancia familiar es el flujo más cómodo, pero
conviene dejar escrito que cualquier persona registrada puede ver quién más lo está.

Los títulos de las listas se completan con metadatos reutilizando `library.enrich.ts` de
LIBRARY-005, con sus mismos topes de tiempo y concurrencia.

## 7. Ediciones a la vez

Es lo último que quedaba pendiente de especificar. Dos reglas:

- **Nombre, descripción y permisos** usan control optimista con `updatedAt`, igual que la
  biblioteca: quien llega tarde recibe **409** y vuelve a cargar.
- **Añadir, quitar y reordenar títulos** se resuelven en el servidor dentro de una
  transacción con la lista bloqueada. Dos personas añadiendo a la vez no se pisan; añadir
  un título que otro acaba de añadir devuelve **409**; mover un título que otro acaba de
  quitar devuelve **404**.

No hay bloqueo de edición ni avisos en vivo: para una lista familiar, releer tras el
conflicto es suficiente y evita montar WebSockets en el MVP.

## 8. Límites

| Qué                      | Tope | Motivo                                   |
| ------------------------ | ---- | ---------------------------------------- |
| Listas por usuario       | 50   | Evita abuso sin estorbar                 |
| Títulos por lista        | 500  | Mantiene barato reindexar el orden       |
| Miembros por lista       | 50   | Por encima del tamaño previsto           |
| Nombre                   | 80   |                                          |
| Descripción              | 300  | Mismo criterio que la biografía          |

Se comprueban dentro de la transacción, no antes, para que no haya carreras.

## 9. Fuera de alcance

Transferir la propiedad, enlaces públicos, votaciones de participantes (aprobadas como
posteriores al MVP), comentarios, listas anidadas y duplicar una lista ajena.

Si el propietario borra su cuenta, sus listas desaparecen con ella. Sin transferencia de
propiedad no hay otra opción coherente, y conviene advertirlo en la interfaz antes de
eliminar una cuenta con listas compartidas.

## 10. Plan de implementación

| Tarea      | Contenido                                                               |
| ---------- | ----------------------------------------------------------------------- |
| `LIST-002` | Modelo, migración y API de listas y títulos, con permisos y tests        |
| `LIST-003` | API de miembros y `GET /api/users`                                       |
| `LIST-004` | Interfaz: mis listas, detalle, añadir títulos y reordenar               |
| `LIST-005` | Interfaz de participantes y permisos                                     |

Cada una en su rama con PR a `develop`, como el resto del proyecto.
