# GarquinsFilm — Estrategia de ramas

**Estado:** Vigente  
**Rama por defecto y de integración:** `develop`  
**Rama de producción:** `main`

## 1. Principios

GarquinsFilm utiliza un **Git Flow simplificado**. Las nuevas funcionalidades, correcciones habituales, documentación y mantenimiento nacen de `develop` y vuelven a `develop` mediante Pull Request (PR). La publicación de una versión se hace con una PR de `develop` a `main` y requiere aprobación del responsable.

Ni los agentes ni las personas deben desarrollar mediante commits directos en `develop` o `main`.

## 2. Convenciones de ramas

| Rama | Nace de | PR hacia | Propósito |
| --- | --- | --- | --- |
| `main` | — | — | Versión estable de producción |
| `develop` | `main` al inicio | `main` | Integración y validación |
| `feature/<descripcion>` | `develop` | `develop` | Funcionalidad nueva |
| `fix/<descripcion>` | `develop` | `develop` | Corrección no urgente |
| `docs/<descripcion>` | `develop` | `develop` | Documentación |
| `chore/<descripcion>` | `develop` | `develop` | Configuración y mantenimiento |
| `hotfix/<descripcion>` | `main` | `main` | Error crítico de producción |

Nombres en minúsculas, sin espacios ni tildes, con palabras en `kebab-case`. Ejemplos: `feature/tmdb-search`, `fix/season-progress`, `docs/branching-strategy`. Usar `feature/`, no `feat/`, para evitar convenciones inconsistentes.

## 3. Flujo normal de desarrollo

1. Verificar estado del árbol de trabajo con `git status` y rama actual con `git branch --show-current`. No eliminar cambios locales ajenos.
2. Actualizar `develop`: `git switch develop && git pull --ff-only origin develop`.
3. Crear la rama correspondiente: `git switch -c feature/nombre-corto` (o `fix/`, `docs/`, `chore/`).
4. Realizar únicamente la tarea acordada; actualizar tests y documentación si aplica.
5. Ejecutar los checks pertinentes (tests, lint, tipado, compilación, seguridad según el cambio).
6. Publicar rama: `git push -u origin feature/nombre-corto`.
7. Abrir **PR con base `develop`**. Describir motivo, cambios, pruebas, riesgos y criterios de aceptación.
8. Esperar revisión y aprobación del responsable. **Los agentes no hacen merge automáticamente.**
9. Tras el merge, actualizar `develop` local y eliminar la rama temporal cuando proceda.

Una PR debe tener alcance pequeño y verificable siempre que sea posible.

## 4. Promoción a producción

1. Validar en `develop` el conjunto de cambios que se desea publicar.
2. Crear **PR `develop` → `main`** con resumen de versión, pruebas, posibles migraciones y plan de reversión cuando corresponda.
3. El responsable autoriza el merge y cualquier despliegue.
4. Con proceso de releases operativo, etiquetar el commit publicado en `main` como `vMAJOR.MINOR.PATCH` (por ejemplo, `v1.0.0`). No crear tags de producción por iniciativa del agente.
5. Confirmar que `develop` y `main` conservan una historia coherente y que toda corrección de producción llega a `develop`.

La existencia de estas ramas **no crea por sí sola** los entornos de desarrollo, staging o producción. Los pipelines y despliegues se definirán en una fase posterior.

## 5. Hotfix urgente en producción

Esta es la única excepción a la regla de crear ramas desde `develop`:

1. Actualizar `main` y crear `hotfix/<descripcion>` **desde `main`**.
2. Aplicar la corrección mínima y ejecutar pruebas.
3. Abrir PR `hotfix/*` → `main`, solicitar aprobación y publicar siguiendo el proceso operativo.
4. Integrar también el arreglo en `develop`, mediante una PR adicional desde la rama hotfix cuando sea viable o mediante `cherry-pick` en una rama `fix/*` creada desde `develop`.
5. Validar ambas ramas y resolver conflictos sin perder cambios.

Nunca fusionar automáticamente `develop` en `main` para resolver un hotfix: podría publicar funcionalidades todavía no aprobadas.

## 6. Reglas obligatorias para agentes

- Antes de editar, consultar `git status`, la rama actual y este documento.
- No realizar commits, pushes ni merges directos a `main` o `develop`.
- Crear toda rama normal a partir de `develop` actualizado; `hotfix/*` es la única excepción y parte de `main`.
- Usar PR hacia `develop` para trabajo normal y PR `develop` → `main` para releases.
- No hacer merge, tags ni despliegues de producción sin aprobación explícita del responsable.
- No utilizar `push --force` en ramas compartidas o protegidas; no borrar trabajo ajeno.
- Si la rama base, el objetivo o el estado del repositorio no están claros, detenerse y preguntar.
- Mantener las PR pequeñas, documentadas y acompañadas de comprobaciones relevantes.
- No exponer secretos ni datos personales en commits, logs o PR.

## 7. Ejemplo rápido

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/movie-library
# editar, validar y confirmar cambios
git push -u origin feature/movie-library
# Crear PR: feature/movie-library -> develop
```

```text
feature/* ──PR──┐
fix/* ──────────┤
docs/* ─────────┼──> develop ── PR de release ──> main
chore/* ────────┘

main ──> hotfix/* ──PR──> main
                  └──> trasladar el mismo arreglo a develop
```

## 8. Protección recomendada en GitHub

Configurar reglas para `main` y `develop`, sujetas a las posibilidades del repositorio y plan: PR obligatorias, aprobación de revisión, checks CI (cuando existan), restricción de borrado y de force-push. Verificar que las reglas se aplican realmente: documentarlas no equivale a activarlas.

## 9. Prioridad documental

`AGENTS.md` debe enlazar a este archivo. Ante instrucciones anteriores que indiquen partir de `main` para nuevas funcionalidades, prevalece **esta estrategia**.
