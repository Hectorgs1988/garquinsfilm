# Instrucciones para agentes — GarquinsFilm

## Fuente de verdad

Leer `docs/PRD.md`, `docs/USER_FLOWS.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` y **`docs/BRANCHING_STRATEGY.md`** antes de implementar. Ante inconsistencias, plantear una propuesta y actualizar documentación en la misma PR; no decidir en silencio.

## Flujo de trabajo

1. **Git Flow obligatorio:** `main` es producción; `develop` es integración y rama por defecto. Crear `feature/<scope>`, `fix/<scope>`, `chore/<scope>` o `docs/<scope>` **desde `develop` actualizado**. Excepción: `hotfix/<scope>` nace de `main` y se integra después también en `develop`. Seguir `docs/BRANCHING_STRATEGY.md`.
2. Una tarea por PR; alcance pequeño, descripción clara y criterios de aceptación. **PR normal hacia `develop`; promoción a producción mediante PR `develop` → `main`.**
3. Tests para lógica relevante; ejecutar linters, chequeos de tipos y tests afectados.
4. No hacer commits ni pushes directos a `main` o `develop`; no hacer merge ni desplegar sin revisión y autorización del responsable.
5. No exponer secretos, tokens, contraseñas, emails reales o datos personales en logs, commits ni respuestas.
6. Antes de integrar librerías o APIs, comprobar licencias, condiciones de uso y dependencias.
7. Evitar sobreingeniería: monolito modular y un despliegue sencillo para el MVP, sujeto a decisión.
8. No implementar IA generativa que procese contenidos TMDB sin autorización/licencias verificadas.
9. Mantener aislamiento de datos por usuario y controles de acceso a listas compartidas en servidor.
10. Usar español en interfaz y documentación funcional, inglés o español consistente en el código.

## Definición de terminado

Código y contratos coherentes, migraciones reproducibles, pruebas satisfactorias, UX con carga/error/vacío, accesibilidad básica, permisos comprobados y documentación actualizada.

## Atención

Los puntos marcados **PENDIENTE** en `docs/DECISIONS.md` NO son elecciones cerradas. No generar código que los trate como definitivos sin validación.
