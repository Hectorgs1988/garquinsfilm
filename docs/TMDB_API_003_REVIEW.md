# TMDB-API-003 — revisión local

Rama: `feature/tmdb-details`. Base: trabajo local existente, conservado.
Estado: implementación y validación local completadas; revisión y CI pendientes.
No se ha creado commit, push, PR ni merge.

## Resultado

- Contratos compartidos de reparto, directores/creadores, vídeos y proveedores.
- Una consulta compuesta con `append_to_response=credits,videos,watch/providers`.
- Normalización defensiva, URLs de imágenes/vídeos validadas, selección de tráiler.
- Streaming exclusivamente ES: suscripción, alquiler y compra; sin precios,
  con atribución JustWatch y enlace de fuente validado cuando está disponible.
- Comprobación de ID solicitado frente al devuelto y los anexos que incluyan ID.
- Caché existente: TTL 5 minutos, LRU, cargas concurrentes compartidas, sin errores
  cacheados ni respuestas caducadas; Better Auth en cada consulta.
- Rechazo de consultas no previstas y `Cache-Control: private, no-store` en detalle.
- Documentación técnica y funcional actualizada; sin cambios de esquema ni datos.

## Verificación — 2026-10-25

Sobre una copia temporal de los mismos archivos fuente, sin archivos `.env` ni
secretos, con las dependencias ya instaladas del proyecto. Node 24.22.1 y pnpm
10.34.7. URL de PostgreSQL ficticia local únicamente para generación del cliente;
no se ejecutó ninguna migración ni prueba de integración con servicios reales.

| Comprobación | Resultado |
| --- | --- |
| `pnpm test` — API | 385 superados; 18 omitidos de integración; 21 archivos aprobados y 5 omitidos |
| `pnpm test` — web | 22 superados, 3 archivos aprobados |
| `pnpm build` | shared, API y web correctos |
| `pnpm typecheck` | shared, API y web correctos |
| `pnpm lint` | ESLint y `format:check` correctos |

La suite completa incluye las regresiones existentes de TMDB-API-002. Las nuevas
pruebas comprueban variantes movie/tv, datos ausentes o inválidos, reparto, equipo,
vídeos compatibles e incompatibles, agrupación ES, enlaces, identidades discordantes,
composición HTTP mediante transporte simulado, auth, errores, TTL, LRU y concurrencia.
Solo mocks y datos ficticios; ninguna petición real a la API de TMDB. Solo se consultó
su documentación técnica pública. No se instalaron ni actualizaron dependencias.

## Límites y continuación

TMDB-TERMS-001 sigue pendiente y bloquea el uso de datos reales. WEB-CATALOG-002
implementará la presentación y el modal accesible con carga tras acción del usuario,
atribución TMDB/JustWatch y estados de disponibilidad no disponible. La API deja
preparados sus datos. No se incluye biblioteca, valoración ni seguimiento personal.
La segunda consulta de sinopsis en idioma original sigue pendiente, según el contrato;
se conserva `overview=null` si falta. No se añade una segunda consulta para vídeos.

Para la revisión, usar `docs/API_INTEGRATION.md` (sección TMDB-API-003) como referencia
del contrato ampliado y `docs/TASKS.md` como registro de alcance. La futura PR tendrá
base `develop` y solo se abrirá cuando lo indique el responsable.
