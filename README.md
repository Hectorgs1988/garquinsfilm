# GarquinsFilm

Monorepositorio pnpm para la aplicación web y la API de GarquinsFilm. Este bootstrap proporciona una pantalla de bienvenida y un endpoint de salud; todavía no implementa funcionalidades de producto.

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

La API expone `GET http://127.0.0.1:3001/health`, que devuelve `{"status":"ok"}`. Se puede cambiar el puerto con `PORT` y la dirección de escucha con `HOST`. No se requieren variables de entorno ni credenciales para el bootstrap.

## Comandos de calidad

Usa `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` y `corepack pnpm build`; con Corepack local antiguo, ejecútalos usando el wrapper reproducible descrito arriba.

La API compila a `apps/api/dist`; el frontend genera su build en `apps/web/dist`. La instalación reproducible de CI utiliza `pnpm install --frozen-lockfile`.

## PostgreSQL local

Requisitos: Docker Engine o Docker Desktop con Docker Compose v2. La configuración utiliza la imagen oficial `postgres:17-alpine`: PostgreSQL 17 continúa con soporte de seguridad hasta noviembre de 2029 y es compatible con Prisma. Se fija el major y no se usa `latest`.

Crea el fichero local de configuración a partir del ejemplo y arranca el servicio:

```bash
cp .env.example .env
docker compose config
docker compose up -d
docker compose ps
```

El servicio solo publica el puerto en `127.0.0.1`. Sus valores configurables son:

| Variable            | Descripción                          | Valor de ejemplo          |
| ------------------- | ------------------------------------ | ------------------------- |
| `POSTGRES_DB`       | Base de datos inicial                | `garquinsfilm`            |
| `POSTGRES_USER`     | Usuario inicial                      | `garquinsfilm`            |
| `POSTGRES_PASSWORD` | Contraseña local de ejemplo          | `garquinsfilm_local_only` |
| `POSTGRES_PORT`     | Puerto publicado en la máquina local | `5433`                    |

Los valores de `.env.example` son exclusivamente ejemplos de desarrollo; cambia la contraseña local antes de usar la base. `.env` está excluido de Git. La imagen aplica estas variables al inicializar un directorio de datos vacío; cambiarlas después no modifica usuarios o contraseñas ya inicializados en el volumen.

Comprueba el healthcheck y ejecuta una consulta:

```bash
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
```

El puerto publicado por defecto es `5433` para no interferir con una instalación local de PostgreSQL que ya use `5432`. Puedes cambiarlo en `.env` si está ocupado.

Para una futura conexión de `apps/api` con Prisma, utiliza el host loopback, el puerto y credenciales de `.env` en una URL de conexión PostgreSQL:

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

`apps/api` utiliza Prisma ORM 7.10.1, `@prisma/client` 7.10.1 y el adaptador oficial `@prisma/adapter-pg` 7.10.1 con `pg`. Prisma 7 requiere un adaptador de driver en ejecución. La misma combinación Prisma 7/PostgreSQL aparece en la documentación actual del adaptador Prisma de Better Auth; la integración de Better Auth sigue fuera de alcance y deberá validarse al implementarla.

La conexión prioriza `DATABASE_URL` del fichero raíz `.env`; `.env.example` contiene un ejemplo ficticio. Si falta esa variable pero están definidas `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD`, la API deriva una URL local en `127.0.0.1` con `POSTGRES_PORT` (por defecto, `5433`), codificando los componentes de la URL. Una `DATABASE_URL` explícita permite usar otro host en entornos posteriores. La API carga el fichero para los comandos pnpm de su workspace y devuelve `503 {"status":"unavailable"}` en `GET /ready` si PostgreSQL no está accesible. `GET /health` sigue comprobando únicamente que el proceso API responde.

Valida el esquema y genera el cliente:

```bash
corepack pnpm --filter @garquinsfilm/api prisma:validate
corepack pnpm --filter @garquinsfilm/api prisma:generate
```

La generación también se invoca desde los scripts `dev`, `typecheck`, `test` y `build`; el cliente se escribe en `apps/api/src/generated` y no se versiona. CI valida y genera explícitamente después de una instalación limpia, antes de typecheck/tests/build. No depende de artefactos generados en un checkout local.

La base del esquema Prisma solo declara el proveedor y el generador: todavía no hay modelos funcionales ni migraciones. Cuando se incorporen modelos, crear y revisar migraciones versionadas con `corepack pnpm --filter @garquinsfilm/api db:migrate`; para aplicar migraciones ya versionadas en un entorno se usará `db:migrate:deploy`. No usar `prisma db push` como sustituto. No ejecutar migraciones en una base compartida sin revisión.

Los tests unitarios de `/ready` simulan los estados disponible y no disponible y se ejecutan sin una base real. La prueba de integración de solo lectura a PostgreSQL está desactivada por defecto; para ejecutarla explícitamente con la base local healthy y `DATABASE_URL` configurada:

```bash
RUN_DB_INTEGRATION_TESTS=1 corepack pnpm --filter @garquinsfilm/api test
```

La prueba solo realiza `SELECT 1`; no crea tablas ni modifica datos.

## Estructura

```text
apps/
  api/       Fastify + TypeScript
  web/       React + TypeScript + Vite + Tailwind CSS
packages/
  shared/    espacio para contratos compartidos; aún vacío
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
