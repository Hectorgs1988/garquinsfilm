# PRD — GarquinsFilm MVP v1.0

**Estado:** alcance funcional acordado; aspectos técnicos pendientes. **Usuarios:** grupo cerrado de personas con cuentas independientes. **Contenido:** películas y series.

## Visión
Descubrir títulos, guardar lo que se quiere ver, registrar lo ya visto y compartir selecciones, sin mezclar el historial ni las notas entre usuarios.

## Alcance funcional MVP
### 1. Cuentas y perfiles
- Cada persona inicia sesión con usuario (email) y contraseña. Registro por invitación (propuesta de MVP, validar canal de invitación).
- Alias visible y avatar opcional; perfil propio y cierre de sesión.
- La biblioteca, notas, progreso y favoritos son independientes y privados por usuario.
- Los propietarios de listas controlan miembros; la autorización se aplica en el backend.

### 2. Catálogo y búsqueda
- Películas y series con fichas obtenidas mediante TMDB (idioma `es-ES`, fallback a datos originales).
- Búsqueda por título; resultados distinguen película/serie, nombre, año y póster.
- Ficha con resumen, géneros, año, puntuación externa y número de votos si TMDB lo facilita.
- Acciones para guardar en biblioteca y añadir a listas compartidas.

### 3. Biblioteca personal
- Películas: **pendiente** o **vista**.
- Series: **pendiente**, **viendo**, **terminada** o **abandonada**.
- Nota personal opcional entre **0,0 y 10,0** inclusive, con **un decimal**; comentario opcional.
- Favoritos y fecha de visionado opcional; edición/eliminación de entradas.
- Filtros por tipo, estado, género y favoritos; orden por nota, año, fecha de guardado y fecha vista.
- Sin duplicados del mismo título en una biblioteca personal.

### 4. Seguimiento de temporadas
- Listar temporadas de series presentes en TMDB.
- Marcar temporada completa como vista/no vista; progreso X/Y temporadas normales.
- Temporada 0 / especiales excluidas del denominador salvo decisión posterior.
- No seguimiento de episodios en MVP.
- Marcar la última temporada disponible no cambia automáticamente el estado de la serie a terminada.

### 5. Listas compartidas
- Crear lista con nombre y descripción opcional; añadir miembros existentes.
- Miembros pueden agregar y quitar títulos; propietario puede gestionar miembros y eliminar lista.
- Guardar quién agregó cada título; no crear entradas duplicadas dentro de la misma lista.
- Añadir a la lista no equivale a añadir a la biblioteca personal.
- No publicar puntuaciones personales automáticamente en una lista compartida.
- Retirar un título de una lista no altera otras listas ni bibliotecas.

### 6. Rankings y descubrir
- Top 5 películas recientes y Top 5 series recientes (según primera emisión para series).
- Mejores por género, año y puntuación TMDB; mínimo de votos configurable para evitar muestras pequeñas.
- Rankings personales basados únicamente en las notas propias.
- Botón para agregar un título a la biblioteca directamente desde los rankings.
- Los criterios y la fuente de puntuación deben quedar visibles; no presentarlos como rankings oficiales de FilmAffinity.

### 7. Interfaz
- Sitio responsive, idioma español y diseño cinematográfico oscuro de partida.
- Vistas: acceso, inicio, buscar, ficha, mi biblioteca, listas, detalle de lista, rankings, perfil.
- Estados de carga, vacío y error; confirmación de acciones destructivas.

## Fuera del MVP
Seguimiento por episodio, integración con cuentas de streaming, filtro por suscripciones, importación FilmAffinity, redes sociales públicas, app móvil nativa, push, estadísticas avanzadas e IA generativa.

## Aceptación transversal
Dos usuarios pueden valorar y gestionar el mismo título sin interferencias; solo usuarios autorizados pueden ver/modificar listas privadas; funcionan búsqueda, biblioteca, progreso por temporadas, listas compartidas y rankings con pruebas de permisos, validación y errores.

## Decisiones de producto a validar durante UX
Tratamiento de re-visionados (en MVP, una entrada por título), orden ante empates y ranking sin suficientes votos; documentarlas antes de codificar reglas conflictivas.
