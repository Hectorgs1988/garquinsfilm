# Arquitectura de GarquinsFilm

## Estilo

Monorepositorio con frontend, API y contratos compartidos. El backend será un monolito modular; no se introducirán microservicios ni Kubernetes.

## Stack aprobado

- `apps/web`: React + TypeScript + Vite + Tailwind CSS.
- `apps/api`: Node.js + TypeScript + Fastify.
- Persistencia: PostgreSQL + Prisma.
- Monorepositorio: pnpm workspaces.
- Contratos compartidos: `packages/shared` para tipos y validaciones compartidas cuando corresponda.
- Pruebas: Vitest y Playwright.
- CI: GitHub Actions.
- Catálogo externo: TMDB, accedido desde el servidor.

Las versiones concretas deben seleccionarse con compatibilidad y soporte vigentes. En particular, Better Auth se integrará solo después de validar su compatibilidad con Fastify y Prisma.

## Autenticación

Better Auth está aprobado para email/contraseña y sesiones seguras, condicionado a la validación de compatibilidad indicada arriba. El producto requiere registro por invitación y recuperación de contraseña.

El proveedor/canal de correo para invitaciones y recuperación sigue pendiente. No se deben fijar ni desplegar servicios de correo hasta que se aprueben.

## Estructura del monorepositorio

```text
apps/
  web/
  api/
packages/
  shared/
docs/
.github/
  agents/
  workflows/
```

La API será responsable de autorización, acceso a PostgreSQL y la integración con TMDB. `packages/shared` no contendrá acceso a la base de datos ni dependerá de modelos generados por Prisma.

## Límites y flujo de datos

```text
React web → API Fastify → módulos de dominio → Prisma/PostgreSQL
                                      └──────→ adaptador TMDB
```

La clave TMDB se mantiene en el servidor. El navegador no realiza llamadas que requieran un secreto. Los datos del catálogo se separan de los datos privados de cada usuario; la caché depende de los términos de TMDB.

## Entornos

- **Desarrollo local:** Docker con PostgreSQL; aplicaciones web y API ejecutadas localmente.
- **Staging y producción:** hosting, topología, dominios, TLS, copias de seguridad y proveedores **pendientes**.
- No crear infraestructura remota ni despliegues automáticos hasta aprobar las decisiones de hosting.

## Calidad y operación

- GitHub Actions validará instalación reproducible, lint, tipos, pruebas y build conforme se incorporen los scripts.
- Vitest cubrirá lógica y pruebas de módulos; Playwright cubrirá recorridos E2E seleccionados.
- Las migraciones de Prisma deben ser reproducibles y revisarse antes de aplicarse a entornos compartidos.
- Los logs no deben contener secretos, contraseñas, tokens de invitación ni datos personales innecesarios.
- La API valida entradas y aplica autorización en el servidor para biblioteca, valoraciones, progreso y listas.

## Pendientes relacionados

- Compatibilidad y versiones de Better Auth, Fastify y Prisma.
- Proveedor de correo.
- Hosting de staging y producción, TLS, dominios y estrategia de backups.
- Condiciones TMDB para atribución, almacenamiento en caché y uso de imágenes.
- Identidad visual definitiva.
