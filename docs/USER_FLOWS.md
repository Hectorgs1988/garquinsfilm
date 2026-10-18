# Flujos principales de usuario

| ID | Flujo | Resultado observable |
|---|---|---|
| F01 | Invitación → registro → login → inicio | Sesión autenticada, perfil propio |
| F02 | Buscar → ficha → añadir a pendientes | Una única entrada en biblioteca |
| F03 | Biblioteca → película → vista → nota decimal | Cambia estado, nota y ranking personal |
| F04 | Ficha serie → viendo → temporada vista | Progreso propio actualizado |
| F05 | Crear lista → agregar miembro existente → agregar título | Miembro autorizado puede ver la lista |
| F06 | Lista compartida → título → guardar en biblioteca propia | Lista compartida permanece intacta |
| F07 | Rankings → filtrar género/periodo → Top 5 → pendientes | Título agregado sin duplicado |
| F08 | Biblioteca → vistas → ordenar por nota desc. | Ranking propio correcto |

## Errores y alternativas obligatorias
- Sesión caducada: redirigir a login sin exponer datos privados.
- Título ya guardado: mostrar acción de edición o aviso, sin duplicarlo.
- Usuario no miembro de lista: 403/404 indistinguible según estrategia documentada.
- TMDB lento o no disponible: error recuperable sin perder datos propios.
- Serie sin temporadas normales: progreso no divide entre cero.
- Nota fuera de rango o con precisión inválida: validación cliente y servidor.
- Usuario invitado sin cuenta aún: flujo pendiente de completar según proveedor de emails elegido.

## Criterios mínimos por pantalla
Búsqueda: debounce, sin resultados, carga, fallo. Ficha: diferencia de media y serie; acciones según sesión. Biblioteca: filtros, orden y vacíos. Listas: miembros, permisos y confirmación para eliminación. Temporadas: estado individual por usuario. Rankings: fuente y filtros visibles.
