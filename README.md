# GarquinsFilm 🎬

Aplicación web responsive para gestionar películas y series, registrar valoraciones personales, seguir temporadas, compartir listas y descubrir títulos mediante rankings externos.

**Estado:** planificación MVP / arranque técnico. **Idioma:** español. **Repositorio:** https://github.com/Hectorgs1988/garquinsfilm

## Documentación
- [PRD](docs/PRD.md)
- [Flujos de usuario](docs/USER_FLOWS.md)
- [Modelo de datos](docs/DATA_MODEL.md)
- [Arquitectura y decisiones pendientes](docs/ARCHITECTURE.md)
- [Contrato de integración TMDB](docs/API_INTEGRATION.md)
- [Seguridad](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Tareas iniciales](docs/TASKS.md)
- [Decisiones](docs/DECISIONS.md)
- [Guía para agentes](AGENTS.md)

## Primer arranque
Todavía no hay código ejecutable. Antes de generarlo, validar las decisiones técnicas enumeradas en `docs/DECISIONS.md`. No subir claves ni ficheros `.env` reales.

## Propuesta de organización
`apps/web` (frontend), `apps/api` (backend), `packages/shared` (contratos), `docs` (especificaciones), `.github` (automatización e instrucciones).
