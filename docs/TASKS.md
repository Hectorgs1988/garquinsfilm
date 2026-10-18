# Backlog inicial — GarquinsFilm

> Las decisiones aprobadas están en `docs/DECISIONS.md`. Las tareas no deben cerrar ni asumir hosting, proveedor de correo, identidad visual o reglas de rankings de series sin aprobación.

| ID | Tarea | Dependencias | Criterio de salida |
|---|---|---|---|
| DOC-001 | Alinear documentación con las decisiones aprobadas | Aprobación del responsable | ADR, PRD, arquitectura, modelo, seguridad, integración TMDB y roadmap coherentes; pendientes explícitos. |
| AUTH-COMPAT-001 | Validar Better Auth con Fastify y Prisma | DOC-001 | Compatibilidad de versiones y configuración documentada; no instalar/usar combinación incompatible. |
| TMDB-TERMS-001 | Verificar condiciones TMDB para atribución, imágenes, uso y caché | DOC-001 | Requisitos aplicables documentados antes de integrar o poner en producción el adaptador. |
| BOOT-001 | Inicializar pnpm workspaces y checks base | DOC-001 | Estructura `apps/web`, `apps/api`, `packages/shared`; scripts reproducibles de lint, tipos, test y build. |
| DB-LOCAL-001 | Preparar PostgreSQL local con Docker y Prisma | DOC-001, BOOT-001 | Base local arranca con configuración de ejemplo sin secretos; migración de prueba reproducible. |
| CI-001 | Configurar GitHub Actions | BOOT-001 | PR valida instalación reproducible, lint, tipos, pruebas y build; sin despliegues. |
| WEB-BASE-001 | Crear base React/Vite y navegación inicial | BOOT-001 | Aplicación ejecutable con estructura de pantallas y estados base, sin fijar identidad visual final. |
| API-BASE-001 | Crear base Fastify y conexión Prisma | BOOT-001, DB-LOCAL-001 | API modular arranca localmente y ejecuta consultas/migraciones de forma reproducible. |
| AUTH-001 | Integrar Better Auth para email/contraseña y sesiones | AUTH-COMPAT-001, API-BASE-001 | Alta/inicio/cierre de sesión según configuración aprobada; cookies y errores probados. |
| EMAIL-DECISION-001 | Aprobar proveedor/canal de correo | Aprobación del responsable | Proveedor elegido antes de implementar envío real de invitaciones y recuperación. |
| AUTH-INVITE-001 | Implementar invitaciones y recuperación por email | AUTH-001, EMAIL-DECISION-001 | Invitación de un solo uso, expiración, recuperación y pruebas sin filtrar tokens ni cuentas. |
| AUTH-QA-001 | Probar aislamiento entre usuarios | AUTH-001, API-BASE-001 | Usuario A no puede leer ni cambiar recursos personales de B; casos negativos en CI. |
| TMDB-001 | Implementar adaptador TMDB del lado del servidor | API-BASE-001, TMDB-TERMS-001 | Búsqueda, detalle y temporadas normalizados; secretos no llegan al cliente; errores externos recuperables. |
| LIB-001 | Implementar biblioteca personal | AUTH-QA-001, TMDB-001 | Estados válidos, unicidad por usuario/medio, filtros y eliminación/edición probados. |
| RATING-001 | Añadir valoraciones personales | LIB-001 | Solo se puede valorar un título de la biblioteca; rango 0,0–10,0 e incrementos de 0,1 validados en servidor. |
| TV-001 | Añadir progreso por temporadas | LIB-001, TMDB-001 | Progreso por usuario y temporadas completas; sin episodios; temporada 0 fuera del denominador. |
| LIST-001 | Añadir listas compartidas y permisos | AUTH-QA-001, TMDB-001 | Miembros añaden/retiran títulos; propietario administra miembros y elimina; sin duplicados ni alteración de bibliotecas. |
| DISC-MOVIE-001 | Implementar ranking inicial de películas | TMDB-001, TMDB-TERMS-001 | España, Top 5, ventana de 90 días, mínimo de 100 votos, orden aprobado y menos de cinco si no hay suficientes. |
| DISC-TV-DECISION-001 | Aprobar reglas de rankings de series | Aprobación del responsable | Período/fecha, región, umbral y desempates definidos antes de implementar ranking de series. |
| DISC-TV-001 | Implementar rankings de series | TMDB-001, DISC-TV-DECISION-001 | Ranking implementado de acuerdo con los criterios aprobados, sin reutilizar implícitamente los de películas. |
| QA-001 | Ejecutar aceptación funcional y accesibilidad básica | AUTH-QA-001, AUTH-INVITE-001, LIB-001, RATING-001, TV-001, LIST-001, DISC-MOVIE-001, DISC-TV-001 | Recorridos principales, permisos, estados de carga/error/vacío y accesibilidad verificados; hallazgos reproducibles. |
| INFRA-DECISION-001 | Aprobar hosting y estrategia de operación | Aprobación del responsable | Hosting, staging/producción, TLS, dominios, backups y restauración definidos antes de provisionar. |

## Dependencias principales

- `DOC-001` habilita el trabajo de implementación.
- `BOOT-001` habilita `CI-001`, `WEB-BASE-001` y, junto con `DB-LOCAL-001`, `API-BASE-001`.
- `AUTH-001` requiere `API-BASE-001` y `AUTH-COMPAT-001`. `AUTH-QA-001` requiere `AUTH-001`; `AUTH-INVITE-001` requiere además que se apruebe `EMAIL-DECISION-001`.
- `TMDB-001` requiere `API-BASE-001` y `TMDB-TERMS-001`. Luego habilita biblioteca, temporadas, listas y rankings.
- `RATING-001` y `TV-001` requieren `LIB-001`; `LIST-001` requiere autenticación validada y el adaptador de catálogo.
- `DISC-MOVIE-001` requiere `TMDB-001` y la verificación de condiciones de TMDB. `DISC-TV-001` requiere además la decisión explícita `DISC-TV-DECISION-001`.
- `QA-001` requiere que estén implementados los flujos de autenticación/invitación, biblioteca, valoraciones, temporadas, listas y ambos rankings.

## Plantilla por issue

**Objetivo** / **Alcance** / **No incluye** / **Dependencias** / **Criterios de aceptación** / **Tests** / **Docs afectadas**.
