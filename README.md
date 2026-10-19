# GarquinsFilm

Monorepositorio pnpm para la aplicación web y la API de GarquinsFilm. La API usa Better Auth para autenticación, invitaciones y recuperación de contraseña; las funcionalidades de biblioteca siguen pendientes y el catálogo TMDB tiene su diseño aprobado (ADR-007) pero no está implementado.

## Requisitos

- Node.js 22.22.2 LTS, 24.15.0 LTS o 26.0.0 o posterior.
- Corepack 0.36.0 o posterior para resolver la versión de pnpm fijada en `package.json`.
- pnpm 10.34.7, gestionado por Corepack y con verificación de firmas habilitada.

## Instalación y desarrollo

Se fija pnpm 10.34.7 porque Corepack 0.36.0 valida su firma y puede ejecutar su formato de distribución. pnpm 12.14.0 usa un punto de entrada que Corepack 0.36.0 todavía no puede invocar. La versión local Corepack 0.29.4, además, no reconoce una clave de firma publicada posteriormente; ese error no indica que la firma de pnpm sea inválida.

Corepack valida las firmas de pnpm. Si Corepack ya está instalado en una versión compatible, ejecuta:

```bash
corepack pnpm install
corepack pnpm dev
```

No es necesario modificar la instalación global de Corepack para usar el procedimiento reproducible de abajo. Descarga Node.js y Corepack fijados en la caché de npm y usa Corepack para validar la firma de pnpm:

```bash
npm exec --yes --package=node@22.22.2 --package=corepack@0.36.0 -- corepack pnpm install
npm exec --yes --package=node@22.22.2 --package=corepack@0.36.0 -- corepack pnpm dev
```

Para otras tareas (por ejemplo `lint`, `typecheck`, `test` o `build`), sustituye `dev` por el comando deseado en la misma invocación `npm exec ... -- corepack pnpm <comando>`. npm reutiliza los paquetes descargados en su caché. Si una instalación local antigua de Corepack falla con `Cannot find matching keyid`, usa este procedimiento temporal en lugar de desactivar la verificación o cambiar Corepack globalmente.

El comando `dev` inicia el frontend en <http://127.0.0.1:5173> y la API en <http://127.0.0.1:3001>. Para arrancar solo una aplicación, ejecuta `corepack pnpm --filter @garquinsfilm/web dev` o `corepack pnpm --filter @garquinsfilm/api dev` (o antepón el wrapper npm anterior si Corepack local no es compatible).

La API expone `GET http://127.0.0.1:3001/health`, que devuelve `{"status":"ok"}`. Se puede cambiar el puerto con `PORT` y la dirección de escucha con `HOST`. Better Auth requiere las variables documentadas más abajo; el placeholder de `BETTER_AUTH_SECRET` en `.env.example` no es un secreto operativo y la API lo rechazará.

## Comandos de calidad

Usa `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` y `corepack pnpm build`; con Corepack local antiguo, ejecútalos usando el wrapper reproducible descrito arriba.

`packages/shared` (contratos TypeScript compartidos) se compila a `packages/shared/dist`. Los comandos raíz `dev`, `typecheck` y `test` lo compilan antes (`build:shared`) y `build` respeta el orden de dependencias. Si ejecutas el script de una aplicación por separado (`--filter`), compila antes el paquete con `corepack pnpm build:shared`.

La API compila a `apps/api/dist`; el frontend genera su build en `apps/web/dist`. La instalación reproducible de CI utiliza `pnpm install --frozen-lockfile`.

## PostgreSQL local

Requisitos: Docker Engine o Docker Desktop con Docker Compose v2. La configuración utiliza la imagen oficial `postgres:17-alpine`: PostgreSQL 17 continúa con soporte de seguridad hasta noviembre de 2029 y es compatible con Prisma. Se fija el major y no se usa `latest`.

Crea el fichero local de configuración a partir del ejemplo, genera un secreto local de Better Auth y arranca PostgreSQL:

```bash
cp .env.example .env
openssl rand -base64 32
# Copia el resultado en BETTER_AUTH_SECRET dentro de .env.
docker compose config
docker compose up -d
docker compose ps
```

El servicio solo publica el puerto en `127.0.0.1`. Sus valores configurables son:

| Variable                      | Descripción                                    | Valor de ejemplo                              |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `POSTGRES_DB`                 | Base de datos inicial                          | `garquinsfilm`                                |
| `POSTGRES_USER`               | Usuario inicial                                | `garquinsfilm`                                |
| `POSTGRES_PASSWORD`           | Contraseña local de ejemplo                    | `garquinsfilm_local_only`                     |
| `POSTGRES_PORT`               | Puerto publicado en la máquina local           | `5433`                                        |
| `BETTER_AUTH_SECRET`          | Secreto de sesión; genera uno localmente       | No usar el placeholder                        |
| `BETTER_AUTH_URL`             | Origen explícito de la API                     | `http://127.0.0.1:3001`                       |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Orígenes web autorizados, separados por comas  | `http://127.0.0.1:5173,http://localhost:5173` |
| `WEB_APP_URL`                 | Origen confiable para enlaces de correo        | `http://127.0.0.1:5173`                       |
| `SMTP_HOST`                   | Host SMTP local                                | `127.0.0.1`                                   |
| `SMTP_PORT`                   | Puerto SMTP local                              | `1025`                                        |
| `SMTP_SECURE`                 | TLS implícito de SMTP                          | `false`                                       |
| `SMTP_USER` / `SMTP_PASSWORD` | Credenciales SMTP opcionales (ambas o ninguna) | Vacías para Mailpit                           |
| `EMAIL_FROM`                  | Remitente ficticio de desarrollo               | `no-reply@garquinsfilm.local`                 |

Los valores de `.env.example` son exclusivamente ejemplos de desarrollo; cambia la contraseña local antes de usar la base. `.env` está excluido de Git. La imagen aplica estas variables al inicializar un directorio de datos vacío; cambiarlas después no modifica usuarios o contraseñas ya inicializados en el volumen.

## Mailpit local

Mailpit captura mensajes de prueba en la máquina local y no los envía a Internet. La imagen oficial `axllent/mailpit:v1.31.6` queda fijada en Compose. La interfaz web y SMTP se publican exclusivamente en `127.0.0.1`; sus puertos host configurables son `MAILPIT_WEB_PORT` (por defecto `8025`) y `MAILPIT_SMTP_PORT` (por defecto `1025`). No requiere credenciales SMTP para las pruebas locales. La API usa un adaptador SMTP genérico configurable por `SMTP_*`; no depende de Mailpit como proveedor en el código.

Inicia el servicio, consulta su estado y abre la interfaz:

```bash
docker compose up -d mailpit
docker compose ps mailpit
open http://127.0.0.1:8025
```

Para verificar SMTP sin usar credenciales ni enviar a un proveedor real, envía un mensaje de prueba desde la máquina local:

```bash
python3 - <<'PY'
import smtplib
from email.message import EmailMessage

message = EmailMessage()
message["From"] = "prueba@garquinsfilm.local"
message["To"] = "destinatario@garquinsfilm.local"
message["Subject"] = "Prueba local de Mailpit"
message.set_content("Mensaje ficticio para comprobar la captura local.")

with smtplib.SMTP("127.0.0.1", 1025) as smtp:
    smtp.send_message(message)
PY
```

Los puertos de estos ejemplos son los valores predeterminados; si has cambiado `MAILPIT_WEB_PORT` o `MAILPIT_SMTP_PORT` en `.env`, sustituye los puertos correspondientes en los comandos. El mensaje debe aparecer en la interfaz de Mailpit. También puedes consultar los mensajes capturados mediante `curl http://127.0.0.1:8025/api/v1/messages`.

Detén únicamente Mailpit sin afectar PostgreSQL:

```bash
docker compose stop mailpit
```

Mailpit es exclusivamente una herramienta de desarrollo local. No publiques sus puertos en interfaces distintas de `127.0.0.1`, no lo expongas a Internet y no lo uses como proveedor de correo real. No tiene persistencia configurada: los mensajes capturados son efímeros. En `development`, la API usa por defecto `127.0.0.1:1025`; las variables `SMTP_*` permiten cambiar el servidor y `EMAIL_FROM` el remitente ficticio. Si cambias `MAILPIT_SMTP_PORT`, actualiza también `SMTP_PORT`.

El adaptador genérico considera entregado un correo únicamente cuando el servidor SMTP acepta el destinatario durante la transacción SMTP. Esto no confirma que el mensaje haya llegado a la bandeja final. La configuración de producción rechaza Mailpit y SMTP loopback; no se ha aprobado ningún proveedor remoto.

## Interfaz de autenticación local

**Estado de WEB-AUTH-001:** implementado, probado localmente e integrado en `develop` (PR #11, GitHub Actions finalizado correctamente); no está desplegado en producción.

La primera interfaz incluye `/login`, `/accept-invitation`, `/forgot-password`, `/reset-password` y el área privada `/app`. Se conecta con la API real de Fastify y Better Auth: no hay datos simulados. El servidor Vite publica un proxy de mismo origen para `/api` hacia Fastify en `127.0.0.1:3001`; las cookies de Better Auth se envían con credenciales y la ruta privada se valida en servidor mediante `GET /api/me`. No se guardan credenciales ni tokens en almacenamiento del navegador.

Los enlaces de invitación y recuperación llevan el token en el fragmento (`#`). La aplicación lo captura una sola vez al cargar `/accept-invitation` o `/reset-password`, lo retira de la barra de direcciones antes de montar la interfaz y lo envía únicamente en el cuerpo de la petición HTTPS/HTTP a la API. Los enlaces de invitación enviados por SMTP incluyen `email` y `token`; las invitaciones creadas con el CLI local `auth:create-local-invitation` pueden contener únicamente `token`. En ese caso el formulario pide el correo y la API valida ambos datos. La API no distingue en su respuesta entre invitación inválida, caducada, revocada o consumida, por lo que la interfaz muestra un mensaje único.

La interfaz es Mobile First: se diseña primero para 360–430 px, con controles táctiles de al menos 44 px y safe areas. El área privada usa navegación inferior en móvil y navegación lateral en escritorio; el pie de las pantallas de autenticación solo se muestra desde 1024 px. Las secciones de biblioteca, listas, rankings y recomendaciones aparecen como «Próximamente» y no son funcionales.

Arranca PostgreSQL y Mailpit si aún no están activos y ejecuta ambas aplicaciones:

```bash
docker compose up -d postgres mailpit
corepack pnpm dev
```

Abre <http://127.0.0.1:5173/login>. Si Corepack local no es compatible, utiliza el wrapper reproducible con Node 22.22.2/Corepack 0.36.0 documentado en «Instalación y desarrollo», sustituyendo `install` por `dev`. El flujo visual es Mobile First y se adapta a escritorio; la dirección visual de ADR-006 continúa pendiente de aprobación manual. El acceso no tiene registro público: hace falta una cuenta creada por invitación. El restablecimiento usa SMTP local capturado por Mailpit; la aplicación no simula cuentas ni persistencia de biblioteca.

### Estado de verificación de WEB-AUTH-001

- **Pruebas automatizadas:** pruebas unitarias del frontend con API simulada (login, validación, recuperación genérica, invitaciones, protección de rutas, logout y errores de red/API); pruebas de la API con PostgreSQL efímero (roles, invitaciones, reutilización, límites de intentos y recuperación); prueba SMTP del adaptador contra Mailpit y remitente simulado en el resto. Estas pruebas no sustituyen la validación manual en navegador.
- **Comprobado manualmente (local):** login del administrador creado por bootstrap, persistencia de sesión al recargar, logout, protección de `/app` sin sesión, solicitud de recuperación con correo en Mailpit, restablecimiento y rechazo de la contraseña anterior, creación de invitación por CLI, aceptación desde el frontend, login del segundo usuario e invitación `CONSUMED`.
- **Auditoría QA:** revisión Mobile First con Playwright a 360, 390 y 430 px y escritorio (sin scroll horizontal, controles de 44 px o más, navegación inferior, footer oculto bajo 1024 px) y comprobaciones de roles contra PostgreSQL temporal. No hay pruebas E2E de navegador en CI.
- **Validado por QA con SMTP real local:** administrador autenticado → `POST /api/admin/invitations` → SMTP → Mailpit → enlace → aceptación, con PostgreSQL temporal aislado y cuentas ficticias. Resultados: HTTP 201 sin token ni hash en la respuesta; correo recibido en Mailpit; enlace `/accept-invitation#email=…&token=…` sin query string; invitación `ACTIVE` solo tras la entrega y la persistencia; aceptación correcta con usuario de rol `user`; reutilización del token rechazada (400, `CONSUMED`); usuario no administrador con 403 y sin correo enviado; fallo SMTP (503) sin invitaciones `ACTIVE`. Esta validación es solo local con Mailpit: confirma la aceptación SMTP, no la entrega a una bandeja real ni a un proveedor de producción. Se ejecutó con un script desechable contra la API (no desde el navegador) y no está automatizada en CI.
- **Pendiente:** pruebas en un dispositivo móvil físico (teclado virtual y safe areas reales); proveedor SMTP de producción; cierre definitivo de ADR-006. PWA, modo offline y notificaciones push quedan fuera del alcance actual.

### Prueba manual de invitación y recuperación

Usa una API apuntando a una base de pruebas desechable y aislada, no al volumen persistente de desarrollo ni a producción. La interfaz ya incluye los formularios de aceptación y restablecimiento; los pasos siguientes indican cómo preparar los enlaces. Para llamadas directas a la API usa un cliente REST local que no registre cuerpos ni enlaces con tokens:

Incluye `Origin: http://127.0.0.1:5173` en las peticiones `POST`; la API conserva las comprobaciones de origen y CSRF.

1. Inicia sesión con un administrador local existente mediante `POST /api/auth/sign-in/email`, con `Origin: http://127.0.0.1:5173`, y conserva su cookie de sesión solo en el cliente local.
2. Envía `POST /api/admin/invitations` con esa cookie y el cuerpo `{"email":"destinatario@garquinsfilm.local"}`. La respuesta no contiene el token. Abre <http://127.0.0.1:8025> y encuentra el mensaje.
3. La invitación dura 7 días. Su URL coloca `email` y `token` en el fragmento `#` del enlace, por lo que el navegador no los transmite automáticamente al servidor. Abre el enlace del mensaje de Mailpit en el navegador para completar el formulario de `/accept-invitation`, o llama una sola vez a `POST /api/invitations/accept` con `email`, `name`, `password` y `token`. Si la invitación se creó con el CLI local, el enlace contiene solo el token (`/accept-invitation#token=...`) y el formulario solicita el correo. El rol lo asigna el servidor.
4. Solicita recuperación mediante `POST /api/auth/request-password-reset` con `{"email":"destinatario@garquinsfilm.local"}`. La respuesta es genérica tanto si existe la cuenta como si no. Abre el nuevo mensaje en Mailpit; el enlace expira en una hora y contiene el token solo en el fragmento.
5. Abre el enlace del correo para usar `/reset-password`, o envía `POST /api/auth/reset-password` con `{"token":"<token del fragmento>","newPassword":"<nueva contraseña>"}`. Comprueba que el inicio de sesión con la nueva contraseña funciona, que las sesiones anteriores quedan invalidadas y que repetir el token se rechaza.

Si SMTP acepta una invitación pero PostgreSQL falla antes de confirmar su activación, la API devuelve un error controlado y la invitación no se puede aceptar, salvo que la activación ya hubiera quedado confirmada y solo se perdiera la respuesta. No hay reintentos automáticos, colas ni regeneración automática. Cuando PostgreSQL vuelva a estar disponible, consulta `GET /api/admin/invitations` con la sesión de administrador. Si la invitación figura `ACTIVE`, su activación quedó confirmada y el destinatario puede usar el enlace enviado mientras no haya caducado ni se haya consumido/revocado. Si figura `PENDING_DELIVERY` o `DELIVERY_FAILED`, revócala con `DELETE /api/admin/invitations/{id}` y crea una invitación nueva con `POST /api/admin/invitations`. Nunca reactives ni reutilices el token del envío anterior. La administración visual de invitaciones pendientes o fallidas aún no está implementada.

No pegues tokens en tickets, logs, repositorios ni historial de shell. Las pruebas automatizadas usan un remitente simulado; no requieren Mailpit ni envían correo real. Con Mailpit activo, ejecuta la prueba SMTP local con:

```bash
NODE_ENV=development \
SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_SECURE=false \
EMAIL_FROM='GarquinsFilm <no-reply@garquinsfilm.local>' \
corepack pnpm --filter @garquinsfilm/api test:mailpit
```

Comprueba el healthcheck y ejecuta una consulta:

```bash
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
```

El puerto publicado por defecto es `5433` para no interferir con una instalación local de PostgreSQL que ya use `5432`. Puedes cambiarlo en `.env` si está ocupado.

La conexión de `apps/api` con Prisma utiliza el host loopback, el puerto y las credenciales de `.env` en una URL de conexión PostgreSQL:

```text
postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:<POSTGRES_PORT>/<POSTGRES_DB>?schema=public
```

Esta URL podrá configurarse como `DATABASE_URL` en el entorno local de la API. La línea de ejemplo de `.env.example` coincide con sus valores `POSTGRES_*`; si cambias el nombre, usuario, contraseña o puerto, actualiza también `DATABASE_URL`. Si la contraseña contiene caracteres reservados en una URL, deben codificarse según URL encoding.

Para reiniciar el contenedor conservando datos:

```bash
docker compose restart postgres
```

Para detener y eliminar el contenedor y la red, manteniendo el volumen de datos:

```bash
docker compose down
```

**Pérdida de datos:** `docker compose down -v` elimina también el volumen nombrado `postgres_data` y todos los datos persistidos. No ejecutes ese comando salvo que quieras borrar la base local por completo.

## Prisma en la API

`apps/api` utiliza Prisma ORM, `@prisma/client` y `@prisma/adapter-pg` 7.10.1 con `pg` 8.23.1. Better Auth y `@better-auth/prisma-adapter` están fijados en 1.7.11, y `@fastify/cors` en 11.3.1. La guía oficial del adaptador usa Prisma 7/PostgreSQL; el adaptador declara peers para Prisma 5, 6 y 7. El puente Fastify y los flujos se validaron en ejecución con PostgreSQL 17 aislado; CI repite las migraciones y pruebas de integración.

La conexión prioriza `DATABASE_URL` del fichero raíz `.env`; `.env.example` contiene un ejemplo ficticio. Si falta esa variable pero están definidas `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`, la API deriva una URL local en `127.0.0.1` con `POSTGRES_PORT` (por defecto, `5433`), codificando los componentes de la URL. Una `DATABASE_URL` explícita permite usar otro host en entornos posteriores. La API carga el fichero para los comandos pnpm de su workspace y devuelve `503 {"status":"unavailable"}` en `GET /ready` si PostgreSQL no está accesible. `GET /health` sigue comprobando únicamente que el proceso API responde.

Valida el esquema y genera el cliente:

```bash
corepack pnpm --filter @garquinsfilm/api prisma:validate
corepack pnpm --filter @garquinsfilm/api prisma:generate
```

La generación también se invoca desde los scripts `dev`, `typecheck`, `test` y `build`; el cliente se escribe en `apps/api/src/generated` y no se versiona. CI valida y genera explícitamente después de una instalación limpia, antes de typecheck/tests/build. No depende de artefactos generados en un checkout local.

El esquema Prisma contiene las entidades de Better Auth (`User`, `Session`, `Account`, `Verification`), el enum `GlobalRole` (`admin|user`), `Invitation` y `AuditEvent`; todavía no contiene modelos funcionales de catálogo. Las migraciones versionadas se prueban en PostgreSQL efímero aislado. CI levanta su propio PostgreSQL 17 para aplicar todas las migraciones y ejecutar tests de auth/invitaciones. No se aplican estas migraciones al volumen local automáticamente. No usar `prisma db push` como sustituto de migraciones versionadas.

Better Auth acepta login por email/contraseña, consulta de sesión en `GET /api/auth/get-session` y cierre de sesión en `POST /api/auth/sign-out`. El registro público `POST /api/auth/sign-up/email` sigue deshabilitado. `POST /api/admin/invitations`, `GET /api/admin/invitations` y `DELETE /api/admin/invitations/:id` requieren sesión y rol `admin`; `POST /api/invitations/accept` crea únicamente usuarios `user` si token, email normalizado, vigencia y uso único son válidos. El consumo y la creación User/Account son atómicos. El endpoint administrativo no devuelve tokens. Las invitaciones pasan por `PENDING_DELIVERY` y solo se activan si SMTP acepta el destinatario; esto no implica recepción final. Un fallo de envío las vuelve inutilizables (`DELIVERY_FAILED`) y una activación no persistida mantiene el estado inactivo. Better Auth provee solicitud y restablecimiento con token de una hora y un solo uso; las respuestas de solicitud son genéricas y el cambio invalida sesiones previas. El endpoint protegido `GET /api/me` devuelve `401` sin sesión. Las cookies son HttpOnly y SameSite=Lax; Secure se activa en producción HTTPS. Se mantienen las comprobaciones de origen/CSRF. Better Auth limita login y recuperación y el plugin Fastify limita las operaciones de invitación; no se confían headers `X-Forwarded-*`.

Los comandos administrativos locales solo operan sobre el servicio `postgres` del [compose.yaml](./compose.yaml). Requieren `NODE_ENV=development`, un destino exacto en `LOCAL_AUTH_ALLOWED_DATABASES`, Docker Compose local y exactamente un contenedor activo con las etiquetas del proyecto/servicio esperados. Antes de escribir, el CLI compara la IP/puerto PostgreSQL observados por la conexión Prisma con la IP interna y puerto del contenedor inspeccionado, y verifica que el puerto publicado sea el de la URL autorizada. El CLI repite la comprobación tras la confirmación y justo antes de escribir. Cualquier error, ambigüedad, contexto Docker remoto, redirección o discrepancia aborta sin escribir. Cada ejecución exige teclear un nonce de un solo uso vinculado a la operación, destino y contenedor. No existe endpoint HTTP de bootstrap. Estos comandos no son un procedimiento para staging o producción.

El primer administrador de desarrollo se crea solo desde una consola local y únicamente en el servicio Compose autorizado. Esta operación modifica la base del volumen local configurado en `compose.yaml`; verifica el destino y conserva una copia de seguridad adecuada antes de usarla. Introduce las variables mediante un gestor de secretos o el entorno de tu terminal; no guardes la contraseña en el repositorio ni en el historial del shell:

```bash
NODE_ENV=development \
DATABASE_URL='<URL configurada para el servicio postgres local de Compose>' \
LOCAL_AUTH_ALLOWED_DATABASES='<usuario@127.0.0.1:puerto/base?schema=public>' \
BOOTSTRAP_ADMIN_EMAIL='<correo-admin>' \
BOOTSTRAP_ADMIN_NAME='<nombre-admin>' \
BOOTSTRAP_ADMIN_PASSWORD='<contraseña-admin>' \
corepack pnpm --filter @garquinsfilm/api auth:bootstrap-admin
```

Para desarrollo local, un administrador existente puede emitir una invitación en la misma base del servicio Compose local; esto también escribe en el volumen de desarrollo y requiere confirmar cuidadosamente el destino. El token se muestra una sola vez en stdout:

```bash
NODE_ENV=development \
DATABASE_URL='<URL configurada para el servicio postgres local de Compose>' \
LOCAL_AUTH_ALLOWED_DATABASES='<usuario@127.0.0.1:puerto/base?schema=public>' \
LOCAL_INVITATION_ADMIN_EMAIL='<correo-admin>' \
LOCAL_INVITATION_EMAIL='<correo-destinatario>' \
corepack pnpm --filter @garquinsfilm/api auth:create-local-invitation
```

El token de invitación solo se almacena en base de datos como hash. Este comando CLI de pruebas muestra un token local una sola vez; no lo copies a logs, tickets o repositorios. El envío ordinario se realiza por el adaptador SMTP, que no devuelve el token en la respuesta HTTP. Si SMTP aceptó el correo pero la activación falla o su confirmación se pierde, la API devuelve un error controlado. Cuando PostgreSQL vuelva a estar disponible, sigue el procedimiento manual indicado arriba: conserva el envío solo si el estado es `ACTIVE`; si permanece `PENDING_DELIVERY` o `DELIVERY_FAILED`, revoca la invitación y emite otra. No hay reintentos automáticos y el token anterior nunca se reactiva ni reutiliza.

No ejecutes migraciones ni tests de autenticación contra el volumen persistente de desarrollo. Para pruebas locales usa una instancia/base desechable con nombre terminado en `_test` y conexión loopback. Las pruebas de integración requieren `AUTH_TEST_DATABASE_URL` y `RUN_AUTH_INTEGRATION_TESTS=1`; setup rechaza una URL que no sea loopback o una base cuyo nombre no termine en `_test`. CI provisiona su propia base PostgreSQL efímera. `pnpm test` ejecuta tests unitarios e integración cuando se establece esa configuración; el script `test:integration` ejecuta los tests de autenticación e invitaciones.

El esquema de Better Auth se puede regenerar con `corepack pnpm --filter @garquinsfilm/api auth:schema:generate`. Después de revisar los cambios del esquema, las migraciones se crean con `corepack pnpm --filter @garquinsfilm/api db:migrate`; el comando debe apuntar exclusivamente a una base aislada de pruebas durante esta tarea. No ejecutar migraciones contra bases compartidas sin revisión.

## Estructura

```text
apps/
  api/       Fastify + TypeScript
  web/       React + TypeScript + Vite + Tailwind CSS
packages/
  shared/    contratos compartidos; vacío por ahora (el catálogo TMDB será su primer uso, ADR-007)
docs/        requisitos y decisiones del producto
.github/
  workflows/ validación continua en PR
```

## Documentación del producto

- [PRD](docs/PRD.md)
- [Flujos de usuario](docs/USER_FLOWS.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Integración TMDB](docs/API_INTEGRATION.md)
- [Seguridad](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Tareas iniciales](docs/TASKS.md)
- [Decisiones](docs/DECISIONS.md)
- [Estrategia de ramas](docs/BRANCHING_STRATEGY.md)
- [Guía para agentes](AGENTS.md)
