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

Better Auth será responsable de email/contraseña y sesiones seguras. Su integración efectiva queda condicionada a validar en ejecución las versiones exactas de Better Auth, su adaptador Prisma y el puente HTTP para Fastify con el stack instalado.

La API montará los endpoints de Better Auth bajo `/api/auth/*` mediante la integración HTTP catch-all adecuada para Fastify. Better Auth reutilizará el singleton Prisma Client de `apps/api`; no se crearán clientes ni pools duplicados. La configuración de base de datos y sus migraciones permanecerá dentro de `apps/api`.

El registro público estará deshabilitado. Solo se podrán crear cuentas aceptando una invitación válida emitida por un administrador. Las invitaciones se vinculan a un email normalizado, vencen a los 7 días y se consumen atómicamente una sola vez. La aceptación correcta no requiere verificación adicional del email.

Los roles globales son `admin` y `user`; solo el servidor puede asignarlos o modificarlos. Ser propietario de una lista compartida es un permiso de esa lista, separado del rol global. El primer administrador se crea con un procedimiento local controlado, nunca mediante un endpoint público.

No se desactivan CSRF ni comprobaciones de origen. Se limitan los intentos de autenticación y no se registran contraseñas, cookies ni tokens. Cookies y sesiones deben configurarse de forma segura según el entorno. CORS y cualquier proxy de confianza se configurarán con orígenes/IPs explícitos, sin confiar indiscriminadamente en headers reenviados.

Para desarrollo local se usará Mailpit con Docker. Las pruebas automatizadas inyectarán un remitente simulado, sin enviar correos reales. No se ha aprobado un proveedor de correo remoto.

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
- Los logs no deben contener secretos, contraseñas, cookies, tokens de sesión/invitación ni datos personales innecesarios.
- La API valida entradas y aplica autorización en el servidor para biblioteca, valoraciones, progreso y listas.

## Pendientes relacionados

- Validación de ejecución de versiones exactas de Better Auth, su adaptador Prisma y el puente HTTP Fastify.
- Proveedor de correo remoto; Mailpit local y remitente simulado en tests sí están aprobados.
- Hosting de staging y producción, TLS, dominios y estrategia de backups.
- Condiciones TMDB para atribución, almacenamiento en caché y uso de imágenes.
- Identidad visual definitiva.
