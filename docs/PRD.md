# PRD — GarquinsFilm MVP v1.0

**Estado:** alcance funcional aprobado; decisiones técnicas aprobadas y pendientes registradas en `docs/DECISIONS.md`. **Usuarios:** grupo cerrado de personas con cuentas individuales. **Contenido:** películas y series.

## Visión

Descubrir títulos, guardar lo que se quiere ver, registrar lo ya visto y compartir selecciones, sin mezclar el historial ni las notas entre usuarios.

## Alcance funcional MVP

### 1. Cuentas y perfiles

- Inicio de sesión con email y contraseña y sesiones mediante Better Auth. Implementados e integrados en `develop`: el core de Better Auth, las invitaciones y el bootstrap local, y la recuperación de contraseña con SMTP local (Mailpit). La interfaz web de autenticación Mobile First (WEB-AUTH-001) está implementada y probada localmente e integrada en `develop` (PR #11, con GitHub Actions finalizado correctamente); no está desplegada en producción.
- El registro público está deshabilitado. Las cuentas se crean únicamente aceptando una invitación válida emitida por un administrador.
- Cada invitación se vincula a un email normalizado, caduca a los 7 días y solo puede usarse una vez. Su token es aleatorio, de alta entropía y almacenado únicamente como hash; la aceptación es atómica frente a solicitudes concurrentes.
- Después de aceptar una invitación válida no se exige verificación adicional del correo.
- Roles globales: `admin` y `user`. La asignación de roles se realiza exclusivamente en el servidor. La propiedad de una lista compartida es independiente del rol global.
- El primer administrador se crea mediante un procedimiento local controlado, nunca a través de un endpoint público.
- El core incluye inicio/cierre de sesión, sesiones/cookies seguras, invitaciones y recuperación de contraseña. Los correos se envían mediante SMTP configurable; localmente se capturan con Mailpit. Un remitente SMTP que acepte el destinatario no garantiza recepción final. No se desactivan CSRF ni comprobaciones de origen y se limitan intentos en endpoints de autenticación.
- Las pruebas automatizadas usan un remitente simulado, sin envío real. No hay proveedor de correo remoto aprobado; Mailpit es solo desarrollo y no se puede usar en producción.
- Alias visible y avatar opcional; perfil propio y cierre de sesión.
- La biblioteca, valoraciones, progreso y favoritos son independientes y privados por usuario.
- Los propietarios de listas controlan los miembros; la autorización se aplica en el backend.

### 2. Catálogo y búsqueda

- Películas y series con fichas obtenidas mediante TMDB (idioma `es-ES`, fallback a datos originales).
- Búsqueda por título; resultados distinguen película/serie, nombre, año y póster.
- Ficha con resumen, géneros, año, puntuación externa y número de votos si TMDB lo facilita.
- Acciones para guardar en biblioteca y añadir a listas compartidas.
- El servidor encapsula el acceso a TMDB; su uso, atribución y caché deben cumplir las condiciones vigentes del servicio.

### 3. Biblioteca personal y valoraciones

- Películas y series comparten los estados **pendiente**, **viendo**, **completado** y **abandonado**. El estado inicial es pendiente.
- Existe una única entrada por identidad externa (`source + type + tmdbId`) y usuario. No se guarda historial ni contador de visionados; volver de completado a viendo y completar de nuevo actualiza `completedAt`, no crea otra entrada.
- Para valorar un título, debe estar en la biblioteca personal.
- Puntuación personal opcional entre **0,0 y 10,0** inclusive, en incrementos de **0,1**; `0` es una nota válida y `null` representa ausencia de puntuación.
- Reseña personal opcional de texto plano, máximo 2.000 puntos de código Unicode, con saltos de línea; no se interpreta Markdown ni HTML. Puede existir una reseña sin puntuación y una puntuación sin reseña.
- La reseña puede marcarse con spoilers; `containsSpoilers` requiere texto de reseña. El ocultamiento visual corresponde al cliente, que debe evitar previews con texto de spoiler.
- Las puntuaciones y reseñas son privadas en esta fase: no hay endpoints para consultar valoraciones ajenas ni publicación automática en perfiles o listas.
- Favoritos independientes del estado; al entrar en completado se registra `completedAt` y se limpia al salir.
- Edición/eliminación de entradas.
- Filtros por tipo, estado y favoritos; orden por fecha de alta o actualización. La vista grid/list se recuerda en `localStorage`, no en el servidor.
- No se permiten duplicados del mismo título en una biblioteca personal.
- La biblioteca no depende de la disponibilidad de TMDB. Los metadatos pueden faltar; la API permite `media: null` y no copia títulos, imágenes, sinopsis ni puntuaciones en PostgreSQL.

### 4. Seguimiento de temporadas

- Listar temporadas de series presentes en TMDB.
- Marcar una temporada completa como vista/no vista; mostrar progreso X/Y temporadas normales.
- Temporada 0/especiales excluida del denominador.
- No se realiza seguimiento de episodios en el MVP.
- Marcar la última temporada disponible no cambia automáticamente el estado de la serie a terminada.

### 5. Listas compartidas

- Crear una lista con nombre y descripción opcional; añadir miembros existentes.
- Los miembros pueden agregar y retirar títulos.
- El propietario administra los miembros y puede eliminar la lista.
- Guardar quién agregó cada título; no crear entradas duplicadas dentro de una lista.
- Añadir a una lista no equivale a añadir a la biblioteca personal.
- No publicar puntuaciones personales automáticamente en listas compartidas.
- Retirar un título de una lista no altera otras listas ni bibliotecas.

### 6. Rankings y descubrir

- Mostrar la fuente y los criterios de cada ranking; no presentarlos como rankings oficiales de FilmAffinity.
- Rankings personales basados únicamente en las notas propias.
- El ranking principal es Top 5. Para películas, la región predeterminada es España; el ranking de películas recientes considera los últimos 90 días y requiere inicialmente un mínimo de 100 votos.
- Orden de películas: puntuación TMDB descendente, número de votos descendente y título ascendente.
- Si hay menos de cinco resultados elegibles, mostrar únicamente los disponibles.
- Las reglas específicas de fecha, período, umbral y orden para rankings de series siguen pendientes.
- El PRD contempla descubrimiento por género y año; los criterios concretos no deben contradecir ADR-005 ni introducir reglas no aprobadas.
- Botón para agregar un título a la biblioteca directamente desde los rankings.

### 7. Interfaz

- Sitio responsive e idioma español.
- La identidad visual (paleta y tipografía) sigue pendiente de aprobación.
- Vistas: acceso, inicio, buscar, ficha, mi biblioteca, listas, detalle de lista, rankings y perfil.
- Estados de carga, vacío y error; confirmación de acciones destructivas.

## Fuera del MVP

Seguimiento por episodio, historial/contadores de visionados, integración con cuentas de streaming, filtro por suscripciones, importación FilmAffinity, redes sociales públicas, app móvil nativa, push, estadísticas avanzadas e IA generativa.

## Aceptación transversal

Dos usuarios pueden gestionar el mismo título sin interferencias; solo usuarios autorizados pueden ver o modificar listas privadas; funcionan búsqueda, biblioteca, progreso por temporadas, listas compartidas y rankings con pruebas de permisos, validación y errores.

## Decisiones no cerradas

Hosting, staging y producción; proveedor de correo remoto; confirmación CI/revisión técnica del core de Better Auth y revalidación si cambian versiones; identidad visual definitiva; y reglas de rankings de series. Mailpit local y remitente simulado en tests sí están aprobados. Consultar `docs/DECISIONS.md`.
