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

La integración de Better Auth 1.7.11 y su adaptador Prisma 1.7.11 con Fastify 5.12.7 y Prisma 7.10.1 se probó localmente. Los modelos de autenticación y su migración versionada se validaron en una base PostgreSQL 17 aislada. La ejecución real de GitHub Actions queda pendiente hasta abrir la Pull Request; cualquier cambio de estas versiones exige revalidación.

## Autenticación

Better Auth es responsable de email/contraseña y sesiones seguras. La integración core se implementó con Better Auth y `@better-auth/prisma-adapter` 1.7.11, Fastify 5.12.7 y Prisma 7.10.1; el puente HTTP, los modelos, la migración y los flujos se probaron con PostgreSQL efímero 17. La CI está configurada para repetir los tests, pero su ejecución real queda pendiente hasta abrir la Pull Request.

La API montará los endpoints de Better Auth bajo `/api/auth/*` mediante la integración HTTP catch-all adecuada para Fastify. Better Auth reutilizará el singleton Prisma Client de `apps/api`; no se crearán clientes ni pools duplicados. La configuración de base de datos y sus migraciones permanecerá dentro de `apps/api`.

El registro público estará deshabilitado. Solo se podrán crear cuentas aceptando una invitación válida emitida por un administrador. Las invitaciones se vinculan a un email normalizado, vencen a los 7 días y se consumen atómicamente una sola vez. La aceptación correcta no requiere verificación adicional del email.

Los roles globales se restringen a `admin` y `user` mediante enum PostgreSQL y se autorizan en el servidor. Ser propietario de una lista compartida es un permiso de esa lista, separado del rol global. El bootstrap inicial solo se ejecuta desde CLI con `NODE_ENV=development`, allowlist explícita y confirmación aleatoria vinculada a operación/destino/contenedor. El CLI verifica que la conexión PostgreSQL efectiva corresponde por IP interna al único contenedor activo `postgres` del proyecto Docker Compose local; contextos Docker remotos y discrepancias se rechazan. No existe endpoint HTTP ni este procedimiento se usa en staging/producción.

Los administradores pueden crear, listar y revocar invitaciones; la aceptación pública requiere token de alta entropía, email normalizado coincidente y estado vigente. Se almacena solo el hash. La invitación nace `PENDING_DELIVERY`, pasa a `ACTIVE` tras confirmación durable del adaptador y la activación queda persistida; solo `ACTIVE` puede consumirse. La transición condicional a `CONSUMED` y la creación de User/Account ocurren en la misma transacción, evitando doble consumo concurrente. Una entrega fallida se marca `DELIVERY_FAILED` si PostgreSQL está disponible; en caso contrario queda `PENDING_DELIVERY`, que también es inutilizable. Si el proveedor confirmó entrega pero la respuesta de commit en DB se pierde, al recuperar la conexión se inspecciona el estado: `ACTIVE` conserva el token entregado; `PENDING_DELIVERY`/`DELIVERY_FAILED` se revoca y se sustituye por una invitación con token nuevo. No se guarda ni reintenta el token previamente entregado. La interfaz no tiene proveedor configurado todavía; el endpoint administrativo falla de forma segura. Un comando local, sujeto a las mismas validaciones de entorno/destino y confirmación interactiva única, permite mostrar tokens solo para pruebas.

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

- Ejecutar y revisar los checks de GitHub Actions al abrir la Pull Request.
- Ejecutar y revisar GitHub Actions al abrir la Pull Request de invitaciones/bootstrap.
- Integrar proveedor de correo y recuperación de contraseña en tareas posteriores; Mailpit local y remitente simulado siguen siendo las opciones aprobadas para esos trabajos.
- Proveedor de correo remoto; Mailpit local y remitente simulado en tests sí están aprobados.
- Hosting de staging y producción, TLS, dominios y estrategia de backups.
- Condiciones TMDB para atribución, almacenamiento en caché y uso de imágenes.
- Identidad visual definitiva.
