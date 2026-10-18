# Arquitectura propuesta (no definitiva)

## Estilo
Monorepo con frontend, API y contratos compartidos; backend modular monolítico, no microservicios.

## Stack candidato
- `apps/web`: React + TypeScript + Vite + Tailwind CSS.
- `apps/api`: Node.js + TypeScript + Express (o Fastify, pendiente de decisión).
- `packages/shared`: tipos, validaciones y contratos.
- ORM: Prisma (candidato).
- BD: PostgreSQL o MySQL, **PENDIENTE** (no asumir MySQL por analogía con otros proyectos).
- Autenticación: sesiones seguras/cookies HttpOnly o proveedor externo **PENDIENTE**.
- Infra: despliegue local en desarrollo; staging y producción **PENDIENTES**.

## Capas
Web → API propia → persistencia propia / adaptador externo TMDB. La clave TMDB permanece en servidor. Nunca realizar llamadas autenticadas a TMDB desde el navegador con secreto embebido.

## Propuesta de estructura futura
```
apps/web/
apps/api/
packages/shared/
docs/
.github/workflows/
```

## Entornos y calidad
- Desarrollo: frontend y backend locales, BD reproducible, variables en `.env` ignorado.
- CI: instalar dependencias de forma reproducible, lint, tipos, tests y build.
- Staging/producción: TLS, rotación de secretos, backups y migraciones controladas (decidir proveedores antes de despliegue).
- Logs sin PII ni secretos y errores estables con request ID.
- Pruebas de integración de permisos, duplicados, puntuaciones y estados.

## Principios
No bloquear al frontend por las caídas de TMDB más allá de lo imprescindible; TTL/cache conforme a condiciones de uso; peticiones paginadas y limitación de tasa; separación de datos externos de datos personales.
