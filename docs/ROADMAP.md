# Roadmap — MVP GarquinsFilm

## Fase 0 — Base documental y validación

- Registrar stack y reglas funcionales aprobadas en ADR y documentos de producto.
- Validación en ejecución del core Better Auth/adaptador Prisma 1.7.11, puente Fastify 5.12.7, Prisma 7.10.1 y PostgreSQL 17 aislado completada en la rama AUTH-001B; queda confirmar CI/revisión y revalidar cualquier cambio de versión.
- Mailpit con Docker está aprobado para desarrollo local; las pruebas automatizadas usarán un remitente simulado. No se ha aprobado un proveedor remoto.
- Verificar condiciones de TMDB para uso, atribución, imágenes y caché.
- Mantener hosting, staging/producción, identidad visual y criterios de rankings de series como pendientes.

**Salida:** contratos documentales coherentes; compatibilidad y dependencias externas conocidas; pendientes sin decisiones implícitas.

## Fase 1 — Bootstrap, entorno local y cuentas

- Monorepo pnpm con `apps/web`, `apps/api` y `packages/shared`.
- CI básico con GitHub Actions, pruebas Vitest/Playwright y checks de tipos/build.
- PostgreSQL local con Docker y migraciones Prisma reproducibles.
- Core Better Auth, sesiones y migración versionados; CI repite tests de integración en PostgreSQL efímero.
- Invitaciones de administrador (email normalizado, 7 días, un solo uso atómico), roles globales `admin|user`, procedimiento local controlado para bootstrap del primer administrador y separación entre rol global y propiedad de listas.
- Recuperación, sesiones/cookies seguras, límites de intentos y pruebas de aislamiento. No exigir verificación adicional del email tras invitación válida.
- Mailpit local y remitente simulado en pruebas; sin proveedor de correo remoto aprobado.

**Demo:** dos usuarios autenticados mantienen sus datos aislados.

### Desglose de AUTH-001

1. Validar Better Auth, adaptador Prisma y puente HTTP Fastify con el singleton Prisma actual. Completado localmente para las versiones fijadas; confirmar CI/revisión.
2. Generar y revisar el esquema de User, Session, Account y Verification, rol global y migración Prisma versionada. Completado para el core.
3. Implementar login, consulta de sesión y logout en Fastify; configurar cookies, origen/CORS y CSRF sin desactivar protecciones y limitar intentos. Completado para el core.
4. Cerrar registro público e implementar emisión administrativa y aceptación de invitaciones vinculadas a email normalizado, con hash, caducidad de 7 días y consumo atómico de un solo uso.
5. Implementar recuperación y cierre de sesión, con respuestas anti-enumeración.
6. Implementar procedimiento local controlado para bootstrap del primer administrador; nunca exponer endpoint público de bootstrap.
7. Integrar Mailpit para desarrollo manual y un remitente simulado para tests; no enviar correo real desde pruebas.
8. Ejecutar pruebas integrales de seguridad, concurrencia, cookies, origen, aislamiento y CI; documentar el flujo operativo.

## Fase 2 — Catálogo, biblioteca y valoraciones

- Adaptador TMDB del lado del servidor, búsqueda y fichas normalizadas.
- Biblioteca personal sin duplicados; valoraciones solo para títulos guardados.
- Nota 0,0–10,0 en incrementos de 0,1, favoritos, filtros y orden.
- Sin re-visionados en el MVP.

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

Seguimiento de episodios, re-visionados, estadísticas avanzadas, recomendaciones (revisar licencias), «Sorpréndeme», notificaciones, importaciones y app nativa si se justifica.
