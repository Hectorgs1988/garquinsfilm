# Flujos principales de usuario

| ID | Flujo | Resultado observable |
|---|---|---|
| F01 | Invitación → registro con email/contraseña → login → inicio | Sesión autenticada mediante Better Auth, tras validar compatibilidad; perfil propio |
| F02 | Buscar → ficha → añadir a pendientes | Una única entrada en biblioteca |
| F03 | Biblioteca → título guardado → marcar visto → valorar | Cambia estado; se guarda nota válida entre 0,0 y 10,0 en incrementos de 0,1 |
| F04 | Ficha de serie → añadir a biblioteca → marcar temporada completa | Progreso propio por temporadas actualizado |
| F05 | Crear lista → agregar miembro existente → agregar/quitar título | Miembro autorizado puede colaborar; propietario administra miembros |
| F06 | Lista compartida → título → guardar en biblioteca propia | Lista compartida permanece intacta |
| F07 | Rankings → filtrar → añadir a pendientes | Título agregado sin duplicado; fuente y criterios visibles |
| F08 | Biblioteca → ordenar por nota descendente | Ranking personal correcto |
| F09 | Login → solicitar recuperación → seguir instrucciones por correo | Recuperación segura; depende del proveedor/canal de correo aún pendiente |

## Errores y alternativas obligatorias

- Sesión caducada: redirigir a login sin exponer datos privados.
- Título ya guardado: mostrar acción de edición o aviso, sin duplicarlo.
- Intento de valorar un título que no está en la biblioteca: rechazar la operación y ofrecer añadirlo primero.
- Usuario no miembro de lista: respuesta 403/404 indistinguible según estrategia documentada.
- Miembro que intenta administrar miembros o eliminar la lista: rechazar; esas acciones corresponden al propietario.
- TMDB lento o no disponible: error recuperable sin perder datos propios.
- Serie sin temporadas normales: el progreso no divide entre cero.
- Nota fuera de rango o con precisión inválida: validación cliente y servidor.
- Invitación o recuperación sin servicio de correo aprobado/configurado: el flujo no se considera operativo; no simular un envío exitoso.

## Criterios mínimos por pantalla

Búsqueda: debounce, sin resultados, carga, fallo. Ficha: diferencia de película/serie; acciones según sesión y estado de biblioteca. Biblioteca: filtros, orden y vacíos. Listas: miembros, permisos y confirmación para eliminación. Temporadas: estado individual por usuario. Rankings: fuente y filtros visibles; ranking de películas conforme a ADR-005. Las reglas de ranking de series siguen pendientes.
