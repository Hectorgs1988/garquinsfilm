# Roadmap — MVP GarquinsFilm

## Fase 0 — Base documental y validación

- Registrar stack y reglas funcionales aprobadas en ADR y documentos de producto.
- Validación en ejecución del core Better Auth/adaptador Prisma 1.7.11, puente Fastify 5.12.7, Prisma 7.10.1 y PostgreSQL 17 aislado completada en la rama AUTH-001B; queda confirmar CI/revisión y revalidar cualquier cambio de versión.
- SMTP local con Mailpit y recuperación Better Auth están implementados y probados; las pruebas automatizadas usan un remitente simulado. No se ha aprobado un proveedor remoto de producción.
- Condiciones de TMDB (TMDB-TERMS-001): **PENDIENTE** de validación por el responsable. La arquitectura de la integración está aprobada en ADR-007 (TMDB-DOC-001); ninguna tarea de implementación TMDB está iniciada.
- Mantener hosting, staging/producción, identidad visual y criterios de rankings de series como pendientes.

**Salida:** contratos documentales coherentes; compatibilidad y dependencias externas conocidas; pendientes sin decisiones implícitas.

## Fase 1 — Bootstrap, entorno local y cuentas

- Monorepo pnpm con `apps/web`, `apps/api` y `packages/shared`.
- CI básico con GitHub Actions, pruebas Vitest/Playwright y checks de tipos/build.
- PostgreSQL local con Docker y migraciones Prisma reproducibles.
- Core Better Auth, sesiones y migración versionados; CI repite tests de integración en PostgreSQL efímero.
- Invitaciones de administrador, roles globales `admin|user` y bootstrap local están implementados e integrados en `develop`.
- Correo SMTP local mediante Mailpit, recuperación de contraseña Better Auth, sesiones/cookies seguras, límites de intentos y pruebas de aislamiento están implementados y probados. No exigir verificación adicional del email tras invitación válida.
- Mailpit local y remitente simulado en pruebas; sin proveedor de correo remoto aprobado.
- **WEB-AUTH-001** (login, aceptación de invitaciones, solicitud y restablecimiento de contraseña, y área privada inicial Mobile First con navegación inferior en móvil y lateral en escritorio) está implementado y probado localmente, integrado en `develop` mediante la PR #11 (GitHub Actions finalizó correctamente); **no está desplegado en producción** (`main` no incluye esta integración hasta una PR `develop` → `main`), conectado a Fastify y Better Auth. Los flujos de login, sesión, logout, recuperación, invitación creada por CLI y aceptación se comprobaron manualmente; no hay E2E de navegador en CI.
- QA validó localmente, con PostgreSQL temporal y Mailpit, el envío SMTP real de invitaciones desde `POST /api/admin/invitations` hasta la aceptación (201, enlace con `email` y `token`, `ACTIVE`, usuario `user`, reutilización rechazada, 403 para no administradores y sin invitaciones `ACTIVE` ante fallo SMTP). No equivale a un proveedor de producción.
- Siguen pendientes: el proveedor de correo de producción, pruebas en dispositivo móvil físico y el cierre de ADR-006. PWA, offline y notificaciones push quedan fuera del alcance actual. La gestión visual de invitaciones pendientes o fallidas queda como mejora futura; en el MVP, su recuperación es manual y no hay reintentos automáticos.

**Demo:** dos usuarios autenticados mantienen sus datos aislados.

### Desglose de AUTH-001

1. Validar Better Auth, adaptador Prisma y puente HTTP Fastify con el singleton Prisma actual. Completado localmente para las versiones fijadas; confirmar CI/revisión.
2. Generar y revisar el esquema de User, Session, Account y Verification, rol global y migración Prisma versionada. Completado para el core.
3. Implementar login, consulta de sesión y logout en Fastify; configurar cookies, origen/CORS y CSRF sin desactivar protecciones y limitar intentos. Completado para el core.
4. Cerrar registro público e implementar emisión administrativa y aceptación de invitaciones vinculadas a email normalizado, con hash, caducidad de 7 días y consumo atómico de un solo uso. El core está en AUTH-001C.1 y la entrega SMTP local en AUTH-001C.2B.
5. Implementar recuperación con respuestas anti-enumeración, tokens temporales de un solo uso y revocación de sesiones. Integrada mediante Better Auth en AUTH-001C.2B.
6. Implementar procedimiento local controlado para bootstrap del primer administrador; nunca exponer endpoint público de bootstrap. Implementado en AUTH-001C.1.
7. Integrar Mailpit para desarrollo manual y un remitente simulado para tests; no enviar correo real desde pruebas. Infraestructura en AUTH-001C.2A; adaptador SMTP y flujos en AUTH-001C.2B.
8. Ejecutar pruebas integrales de seguridad, concurrencia, cookies, origen, aislamiento y CI; documentar el flujo operativo.

## Fase 2 — Catálogo, biblioteca y valoraciones

Catálogo TMDB (ADR-007: React → Fastify → TMDB, caché en memoria, contratos en `packages/shared`). Todas las tareas están **pendientes de implementación**; su documentación (TMDB-DOC-001) no las marca como hechas:

1. **TMDB-DOC-001** — Documentación y ADR-007 (Architect). Documentación redactada; pendiente de revisión y PR.
2. **TMDB-API-001** — Cliente TMDB, configuración y errores (Backend). Incluye cerrar el consumo de `packages/shared`.
3. **TMDB-API-002** — Búsqueda, validación, normalización y caché (Backend).
4. **TMDB-API-003** — Detalles de películas y series (Backend).
5. **WEB-CATALOG-001** — Búsqueda Mobile First y atribución TMDB (Frontend).
6. **WEB-CATALOG-002** — Fichas de películas y series (Frontend).

Dependencias y criterios en `docs/TASKS.md`. Cada tarea va en su rama `feature/*` con PR a `develop`. TMDB-TERMS-001 sigue pendiente.

- Biblioteca personal sin duplicados; funciona con la identidad externa aunque no haya metadatos de catálogo. Valoraciones solo para títulos guardados.
- Nota 0,0–10,0 en incrementos de 0,1, favoritos, filtros y orden.
- Estados comunes para películas y series: pendiente, viendo, completado y abandonado; se permiten transiciones entre ellos.
- Sin entradas adicionales, historial ni contadores de visionados en el MVP.

**Demo:** dos usuarios guardan el mismo título y gestionan estados y valoraciones independientes.

## Fase 3 — Temporadas y listas compartidas

- Progreso por temporadas completas, sin seguimiento de episodios.
- Listas compartidas con adición y retirada de títulos por miembros.
- Solo el propietario administra miembros y elimina la lista.
- Pruebas de permisos y aislamiento.

**Demo:** miembros colaboran en una lista sin modificar bibliotecas personales ajenas.

## Fase 4 — Descubrir y estabilizar

- Rankings de películas conforme a ADR-005: España, Top 5, últimos 90 días, mínimo inicial de 100 votos y orden aprobado.
- No cerrar ni implementar reglas de rankings de series hasta su aprobación.
- QA responsive, accesibilidad, estados de error y vacíos.
- Documentación de despliegue y backups una vez aprobado el hosting.

**Demo:** ranking de películas reproducible con fuente y criterios visibles.

## Después del MVP

Seguimiento de episodios, historial/contadores de visionados, estadísticas avanzadas, recomendaciones (revisar licencias), «Sorpréndeme», notificaciones, importaciones y app nativa si se justifica.
