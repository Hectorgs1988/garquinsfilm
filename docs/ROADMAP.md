# Roadmap — MVP GarquinsFilm

## Fase 0 — Base documental y validación

- Registrar stack y reglas funcionales aprobadas en ADR y documentos de producto.
- Validar compatibilidad de versiones de Better Auth con Fastify y Prisma antes de integrar la autenticación.
- Acordar proveedor/canal de correo antes de habilitar invitaciones y recuperación por email.
- Verificar condiciones de TMDB para uso, atribución, imágenes y caché.
- Mantener hosting, staging/producción, identidad visual y criterios de rankings de series como pendientes.

**Salida:** contratos documentales coherentes; compatibilidad y dependencias externas conocidas; pendientes sin decisiones implícitas.

## Fase 1 — Bootstrap, entorno local y cuentas

- Monorepo pnpm con `apps/web`, `apps/api` y `packages/shared`.
- CI básico con GitHub Actions, pruebas Vitest/Playwright y checks de tipos/build.
- PostgreSQL local con Docker y migraciones Prisma reproducibles.
- Integración Better Auth tras completar la validación de compatibilidad.
- Cuentas individuales, invitaciones, recuperación y pruebas de aislamiento; el envío de correo depende de aprobar proveedor.

**Demo:** dos usuarios autenticados mantienen sus datos aislados.

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
