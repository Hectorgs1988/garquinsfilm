# Registro de decisiones

## Confirmadas — producto
- PROD-001: nombre GarquinsFilm.
- PROD-002: películas y series desde MVP.
- PROD-003: varios usuarios con usuario y contraseña individuales.
- PROD-004: nota personal de 0 a 10 con decimales (se propone precisión de 0,1).
- PROD-005: seguimiento de series por temporadas completas.
- PROD-006: listas compartidas desde MVP; notas independientes.
- PROD-007: no filtrar títulos por suscripciones de streaming.
- PROD-008: TMDB como fuente candidata principal; rankings no presentados como FilmAffinity.

## Pendientes de decisión — arquitectura
- **ADR-001:** PostgreSQL vs MySQL y estrategia de desarrollo local.
- **ADR-002:** Express vs Fastify y herramienta ORM definitiva.
- **ADR-003:** Auth propia vs proveedor; servicio de correos de invitación y recuperación de contraseña.
- **ADR-004:** Hosting dev/staging/prod (doméstico, cloud o mixto), TLS, dominios y backups.
- **ADR-005:** Resolución de periodos y región para rankings de estrenos.
- **ADR-006:** Diseño gráfico final, paleta y tipografía.

## Convenciones temporales
Hasta decidir ADR, el stack descrito en arquitectura es **candidato**, no compromiso. Los agentes no deben interpretar preferencias de otros proyectos como decisiones de GarquinsFilm.
