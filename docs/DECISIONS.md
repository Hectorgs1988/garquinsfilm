# Registro de decisiones

Este documento distingue decisiones aprobadas de cuestiones todavía pendientes. Las propuestas y los detalles no enumerados como aprobados no se deben tratar como decisiones.

## Decisiones de producto aprobadas

- **PROD-001:** El producto se llama GarquinsFilm.
- **PROD-002:** Películas y series forman parte del MVP.
- **PROD-003:** Cada usuario tiene una cuenta individual con email y contraseña.
- **PROD-004:** Las valoraciones van de 0,0 a 10,0, en incrementos de 0,1.
- **PROD-005:** Para valorar un título, debe estar primero en la biblioteca personal.
- **PROD-006:** El progreso de series se registra por temporadas completas; no se siguen episodios en el MVP.
- **PROD-007:** Las listas compartidas forman parte del MVP y no publican valoraciones personales.
- **PROD-008:** Los miembros pueden añadir y retirar títulos. El propietario administra los miembros y puede eliminar la lista.
- **PROD-009:** Los re-visionados quedan fuera del MVP; se mantiene una entrada por título y usuario.
- **PROD-010:** No se filtran títulos por suscripciones a servicios de streaming.
- **PROD-011:** TMDB es la fuente externa de películas y series. Los rankings no se presentan como rankings oficiales de FilmAffinity.
- **PROD-012:** El registro es mediante invitación; se incluyen recuperación de contraseña y sesiones seguras. Mailpit está aprobado para desarrollo local y los tests usan remitente simulado; un proveedor de correo remoto sigue pendiente.

## ADR-001 — Base de datos y desarrollo local

**Estado: APROBADO**

- PostgreSQL es la base de datos del proyecto.
- El entorno local utilizará Docker para PostgreSQL.
- El hosting de base de datos para staging y producción no queda decidido por este ADR.

## ADR-002 — Stack de aplicación y herramientas

**Estado: APROBADO**

- Frontend: React, TypeScript, Vite y Tailwind CSS.
- Backend: Node.js y Fastify.
- Persistencia: PostgreSQL con Prisma.
- Monorepositorio: pnpm workspaces.
- Pruebas: Vitest y Playwright.
- CI: GitHub Actions.
- TMDB: fuente externa para películas y series, consumida desde el servidor.

Las versiones concretas se fijarán durante el bootstrap atendiendo a compatibilidad y soporte. La integración Better Auth se rige además por ADR-003.

## ADR-003 — Autenticación y correo

**Estado: PARCIALMENTE APROBADO — decisiones funcionales y de seguridad aprobadas; validación local completada; ejecución de CI pendiente**

- Better Auth 1.7.11 será la solución de autenticación para email/contraseña y sesiones. La integración con Fastify 5.12.7 y Prisma 7.10.1 se probó localmente; los modelos y la migración versionada se validaron en una base PostgreSQL 17 efímera y aislada. GitHub Actions está configurado para repetir los checks, pero su ejecución real queda pendiente hasta abrir la Pull Request. Cualquier cambio de versión requiere revalidación.
- El registro público estará deshabilitado. Solo se crearán cuentas mediante una invitación válida.
- Solo los administradores pueden emitir invitaciones. Cada invitación se vincula a un email normalizado, expira a los 7 días y solo puede aceptarse una vez.
- El token de invitación será aleatorio y de alta entropía; se almacenará únicamente su hash. La aceptación será atómica y estará protegida frente a solicitudes concurrentes.
- Tras aceptar correctamente una invitación no se exigirá una verificación adicional del correo.
- Habrá dos roles globales: `admin` y `user`. Los roles serán asignados y autorizados exclusivamente en el servidor, nunca desde parámetros del navegador.
- La propiedad de una lista compartida es independiente del rol global. Los permisos de propietario de lista no se derivan de ser `admin`.
- El primer administrador se creará mediante un procedimiento local controlado, nunca mediante un endpoint público.
- Para desarrollo local se utilizará Mailpit con Docker. Las pruebas automatizadas usarán un remitente simulado y no enviarán correos reales.
- No se desactivarán las protecciones CSRF ni las comprobaciones de origen. Se protegerán sesiones y cookies, se limitarán intentos en endpoints de autenticación y no se registrarán tokens, contraseñas ni cookies.
- No se incluirán credenciales reales en archivos versionados.
- **PENDIENTE:** ejecución y revisión de GitHub Actions al abrir la Pull Request. Las invitaciones, el bootstrap local del primer administrador y la recuperación de contraseña quedan para tareas posteriores. Si se cambian las versiones de Better Auth, adaptador Prisma, Fastify, Prisma o PostgreSQL, repetir las pruebas de compatibilidad antes de integrar.

No implementar autenticación propia como sustituto ni alterar las decisiones aprobadas sin autorización.

## ADR-004 — Infraestructura y despliegue

**Estado: PARCIALMENTE APROBADO**

- Desarrollo local: Docker con PostgreSQL.
- No introducir microservicios ni Kubernetes.
- **PENDIENTE:** hosting, staging, producción, dominios, TLS, copias de seguridad, restauración y sus proveedores.

La aprobación de Docker local no autoriza a crear infraestructura remota.

## ADR-005 — Rankings

**Estado: PARCIALMENTE APROBADO**

Reglas iniciales aprobadas para rankings de películas:

- Región predeterminada: España.
- Ranking principal: Top 5.
- Películas recientes: estrenos de los últimos 90 días.
- Umbral inicial: mínimo de 100 votos.
- Orden: puntuación TMDB descendente; empate por número de votos descendente; empate restante por título ascendente.
- Si hay menos de cinco resultados elegibles, mostrar solo los disponibles.
- Mostrar fuente y criterios del ranking.

**PENDIENTE:** criterios de período, fecha, umbral y orden para rankings de series. No asumir que las reglas de películas se aplican a series.

## ADR-006 — Identidad visual

**Estado: PENDIENTE**

La paleta, tipografía y dirección visual definitivas todavía no se han aprobado. La interfaz seguirá en español y será responsive; cualquier propuesta visual de partida no constituye una decisión de identidad.
