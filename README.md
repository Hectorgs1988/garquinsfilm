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
