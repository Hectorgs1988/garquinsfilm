# Instrucciones para agentes — GarquinsFilm

## Fuente de verdad
Leer `docs/PRD.md`, `docs/USER_FLOWS.md`, `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` y `docs/DECISIONS.md` antes de implementar. Ante inconsistencias, plantear una propuesta y actualizar documentación en la misma PR; no decidir en silencio.

## Flujo de trabajo
1. Trabajar en ramas `feat/<scope>`, `fix/<scope>`, `chore/<scope>` o `docs/<scope>`, partiendo de `main` actualizado.
2. Una tarea por PR; alcance pequeño, descripción clara y criterios de aceptación.
3. Tests para lógica relevante; ejecutar linters, chequeos de tipos y tests afectados.
4. No hacer push directo a `main` ni merge sin revisión del responsable.
5. No exponer secretos, tokens, contraseñas, emails reales o datos personales en logs, commits ni respuestas.
6. Antes de integrar librerías o APIs, comprobar licencias, condiciones de uso y dependencias.
7. Evitar sobreingeniería: modular monolith y un despliegue sencillo para el MVP, sujeto a decisión.
8. No implementar IA generativa que procese contenidos TMDB sin autorización/licencias verificadas.
9. Mantener aislamiento de datos por usuario y controles de acceso a listas compartidas en servidor.
10. Usar español en interfaz y documentación funcional, inglés o español consistente en el código.

## Definición de terminado
Código y contratos coherentes, migraciones reproducibles, pruebas satisfactorias, UX con carga/error/vacío, accesibilidad básica, permisos comprobados y docs actualizados.

## Atención
Los puntos marcados **PENDIENTE** en `docs/DECISIONS.md` NO son elecciones cerradas. No generar código que los trate como definitivos sin validación.
