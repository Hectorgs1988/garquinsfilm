# Registro de decisiones

Este documento distingue decisiones aprobadas de cuestiones todavía pendientes. Las propuestas y los detalles no enumerados como aprobados no se deben tratar como decisiones.

## Decisiones de producto aprobadas

- **PROD-001:** El producto se llama GarquinsFilm.
- **PROD-002:** Películas y series forman parte del MVP.
- **PROD-003:** Cada usuario tiene una cuenta individual con email y contraseña.
- **PROD-004:** Las valoraciones van de 0,0 a 10,0, en incrementos de 0,1.
- **PROD-005:** Para valorar un título, debe estar primero en la biblioteca personal.
- **PROD-006:** El progreso de series se registra por temporadas completas; no se siguen episodios en el MVP.
- **PROD-007:** Las listas compartidas forman parte del MVP y no publican valoraciones personales.
- **PROD-008:** Los miembros pueden añadir y retirar títulos. El propietario administra los miembros y puede eliminar la lista.
- **PROD-009:** Los re-visionados quedan fuera del MVP; se mantiene una entrada por título y usuario.
- **PROD-010:** No se filtran títulos por suscripciones a servicios de streaming.
- **PROD-011:** TMDB es la fuente externa de películas y series. Los rankings no se presentan como rankings oficiales de FilmAffinity.
- **PROD-012:** El registro es mediante invitación; se incluyen recuperación de contraseña y sesiones seguras. El proveedor/canal de correo sigue pendiente.

## ADR-001 — Base de datos y desarrollo local

**Estado: APROBADO**

- PostgreSQL es la base de datos del proyecto.
- El entorno local utilizará Docker para PostgreSQL.
- El hosting de base de datos para staging y producción no queda decidido por este ADR.

## ADR-002 — Stack de aplicación y herramientas

**Estado: APROBADO**

- Frontend: React, TypeScript, Vite y Tailwind CSS.
- Backend: Node.js y Fastify.
- Persistencia: PostgreSQL con Prisma.
- Monorepositorio: pnpm workspaces.
- Pruebas: Vitest y Playwright.
- CI: GitHub Actions.
- TMDB: fuente externa para películas y series, consumida desde el servidor.

Las versiones concretas se fijarán durante el bootstrap atendiendo a compatibilidad y soporte. La integración Better Auth se rige además por ADR-003.

## ADR-003 — Autenticación y correo

**Estado: PARCIALMENTE APROBADO**

- Better Auth es la solución elegida para email/contraseña y sesiones.
- La integración queda condicionada a validar la compatibilidad de las versiones elegidas de Better Auth, Fastify y Prisma antes de incorporar dependencias.
- El flujo de registro requiere invitación; también se requiere recuperación de contraseña.
- **PENDIENTE:** proveedor/canal de correo para invitaciones y recuperación.
- **PENDIENTE:** detalles de configuración que dependan de la validación de compatibilidad de Better Auth.

No implementar autenticación propia como sustituto sin aprobación.

## ADR-004 — Infraestructura y despliegue

**Estado: PARCIALMENTE APROBADO**

- Desarrollo local: Docker con PostgreSQL.
- No introducir microservicios ni Kubernetes.
- **PENDIENTE:** hosting, staging, producción, dominios, TLS, copias de seguridad, restauración y sus proveedores.

La aprobación de Docker local no autoriza a crear infraestructura remota.

## ADR-005 — Rankings

**Estado: PARCIALMENTE APROBADO**

Reglas iniciales aprobadas para rankings de películas:

- Región predeterminada: España.
- Ranking principal: Top 5.
- Películas recientes: estrenos de los últimos 90 días.
- Umbral inicial: mínimo de 100 votos.
- Orden: puntuación TMDB descendente; empate por número de votos descendente; empate restante por título ascendente.
- Si hay menos de cinco resultados elegibles, mostrar solo los disponibles.
- Mostrar fuente y criterios del ranking.

**PENDIENTE:** criterios de período, fecha, umbral y orden para rankings de series. No asumir que las reglas de películas se aplican a series.

## ADR-006 — Identidad visual

**Estado: PENDIENTE**

La paleta, tipografía y dirección visual definitivas todavía no se han aprobado. La interfaz seguirá en español y será responsive; cualquier propuesta visual de partida no constituye una decisión de identidad.
