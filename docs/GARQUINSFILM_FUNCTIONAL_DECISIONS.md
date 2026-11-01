# GarquinsFilm — Decisiones funcionales consolidadas

**Estado:** borrador consolidado actualizado para revisión e incorporación al repositorio.  
**Fecha:** 19 de octubre de 2026.  
**Naturaleza:** documento funcional; no implica que las funcionalidades descritas estén implementadas.  
**Fuente:** decisiones expresas tomadas durante las sesiones de diseño del producto. Se diferencian de recomendaciones de implementación y asuntos pendientes.

## 1. Visión y alcance

GarquinsFilm es una aplicación para **descubrir, organizar y valorar películas y series**, no para reproducir contenido audiovisual. La primera etapa será **gratuita, privada y accesible por invitación**, dirigida inicialmente a cuatro personas como máximo (familia y amigos). Una eventual publicación en tiendas de aplicaciones es una **posibilidad futura**, no un requisito del MVP.

El producto será **Mobile First**, con una pantalla de inicio mixta que combine descubrimiento de contenido y actividad personal, manteniendo la identidad visual oscura definida por el proyecto.

### Estado técnico de referencia

- La autenticación, las cuentas y las invitaciones ya están integradas en `develop`.
- La arquitectura TMDB (ADR-007) y el cliente HTTP seguro con contratos compartidos ya están integrados en `develop`.
- La búsqueda, los detalles, la biblioteca, las valoraciones, las listas y la actividad social **no están implementados todavía**.
- El token de TMDB se conserva únicamente en configuración privada del backend. Su obtención no resuelve por sí sola `TMDB-TERMS-001`.

## 2. Inicio y descubrimiento — aprobado

**Modelo de portada:** opción mixta, combinando descubrimiento y biblioteca/actividad personal según la disponibilidad de esas funciones.

**Secciones de descubrimiento separadas:**

1. **Tendencias generales**: películas y series, identificadas claramente por tipo.
2. **Películas populares**.
3. **Series populares**.

Cada sección se plantea con carteles adaptados a móvil, navegación horizontal, entrada a la ficha de cada título y opción «Ver todo» cuando esté implementada. Son criterios de diseño propuestos durante la conversación, sujetos a validación de UX, no un contrato técnico ya implementado.

**Evolución de recomendaciones:** empezar por tendencias y populares; añadir recomendaciones personalizadas más adelante, cuando exista historial suficiente de valoraciones y se hayan verificado las condiciones aplicables al uso de los datos. No se requiere IA generativa.

**Evolución de portada:** cuando existan datos del usuario, incorporar pendientes, últimos títulos vistos y valoraciones. La actividad de otros usuarios dependerá de sus opciones de privacidad.

## 3. Biblioteca personal — aprobado

- Al añadir una película o serie, el usuario **elige el estado inicial**.
- Cada combinación de usuario, tipo de contenido e identificador TMDB tendrá **una única entrada** en su biblioteca; cambiar de estado no crea duplicados.
- Se permite cambiar el estado posteriormente.
- Una lista temática no sustituye ni altera por sí sola la biblioteca personal.

### Estados

| Contenido | Estados disponibles                      |
| --------- | ---------------------------------------- |
| Película  | Pendiente, vista, abandonada             |
| Serie     | Pendiente, viendo, terminada, abandonada |

La puntuación y el favorito son independientes del estado.

### Favoritos

- Marcado independiente mediante un corazón o control equivalente.
- Es posible guardar como favorito cualquier título, incluso pendiente o abandonado.
- Cambiar el estado no elimina el favorito, ni al revés.
- La biblioteca tendrá un filtro de favoritos.

## 4. Seguimiento de series — aprobado

- Cada serie tiene un **estado general** y un conjunto de **temporadas marcadas como vistas**.
- El seguimiento en el MVP será **por temporadas, no por episodios**.
- La temporada **0 (especiales)** no cuenta para el progreso normal.
- La información de temporadas vistas permanece si se publica una temporada nueva.
- El progreso puede calcularse como temporadas normales vistas / temporadas normales disponibles; los casos de temporadas aún no estrenadas deberán definirse con más detalle antes de implementar.
- Se puede valorar una serie sin haber terminado todas sus temporadas.

**Pendiente de especificación:** reglas de sincronización entre «terminada» y temporadas vistas; comportamiento cuando TMDB añade, retira o renumera temporadas.

## 5. Valoraciones — aprobado

- La propuesta inicial de escala **entera de 1 a 10**, sin decimales, queda sustituida por la decisión posterior RATINGS-002: **0,0 a 10,0 en pasos de 0,1**, con cero válido y `null` como ausencia de nota.
- Valorar es **opcional** y la nota se puede modificar o eliminar.
- Estado, favorito y valoración son independientes.
- Las notas propias de GarquinsFilm se distinguen visualmente de las puntuaciones de TMDB.
- En la ficha se mostrarán, cuando estén disponibles:
  - Nota propia del usuario.
  - **Media GarquinsFilm**, calculada **solo con puntuaciones compartidas públicamente dentro de la comunidad registrada**, conforme a la privacidad de cada autor.
  - **Número de puntuaciones** que forman la media.
  - Puntuación TMDB por separado, nunca incluida en la media GarquinsFilm.
  - Notas individuales y nombre de usuario de quienes hayan autorizado compartirlas.
- Si no hay valoraciones visibles, mostrar **«Sin valoraciones públicas»**, nunca `0` como si fuese una media real.

**Aclaración:** «públicamente» en este documento significa **visible para otros usuarios autenticados de GarquinsFilm**, no indexada ni accesible desde Internet sin iniciar sesión.

## 6. Reseñas escritas y spoilers — aprobado

- Además de la nota, cada usuario puede redactar una **reseña opcional** de una película o serie.
- Puede existir una reseña **sin nota**; estas reseñas no cuentan para la media numérica.
- Cada usuario dispone de una reseña principal por título, editable o eliminable.
- No se contemplan hilos de comentarios ni respuestas en esta fase.
- Las reseñas siguen la configuración de privacidad aplicable a las valoraciones: **privadas por defecto**.
- El autor puede marcar la reseña como **«Contiene spoilers»**.
- Si hay spoilers, el texto aparecerá **oculto inicialmente** para otros usuarios, con acción explícita para revelarlo y opción de volver a ocultarlo.
- No deben revelarse fragmentos de la reseña en previsualizaciones, resultados de actividad, notificaciones u otros extractos.
- La puntuación, cuando sea visible, puede mostrarse sin revelar el texto marcado como spoiler.
- Marcar spoilers no altera la privacidad: una reseña privada sigue siendo privada.

**Especificación RATINGS-002 aprobada para el backend privado:** texto plano (sin Markdown ni HTML interpretado), hasta 2.000 puntos de código Unicode, saltos de línea permitidos; normalizar CRLF/CR a LF y recortar espacios Unicode en los extremos. Texto vacío normalizado equivale a ausencia. Spoilers requieren reseña no vacía; sin reseña el indicador es `false`. El frontend futuro ocultará inicialmente las reseñas con spoilers y evitará previews. Las rutas implementadas en esta fase solo permiten al propietario acceder a sus datos.

## 7. Listas — aprobado

Se admitirán **tres modalidades**:

| Modalidad        | Visibilidad                     | Edición                            |
| ---------------- | ------------------------------- | ---------------------------------- |
| Personal privada | Solo propietario                | Propietario                        |
| Compartida       | Propietario y usuarios elegidos | Solo propietario                   |
| Colaborativa     | Propietario y usuarios elegidos | Propietario y editores autorizados |

### Miembros y permisos

- Se comparten listas **seleccionando usuarios registrados de GarquinsFilm**; no se requieren enlaces públicos en el MVP.
- Permisos por participante: **lector** o **editor**.
- El **propietario** puede ver y editar la lista, cambiar nombre y permisos, gestionar miembros y eliminar la lista.
- El **editor** puede consultar, añadir y retirar títulos; no puede gestionar permisos ni eliminar la lista.
- El **lector** solo puede consultar.
- Un usuario **sin acceso** no puede consultar ni modificar la lista.
- Retirar acceso debe surtir efecto en las siguientes solicitudes, con autorización aplicada en backend.

### Contenido de las listas

- Una lista puede combinar películas y series.
- No se permiten duplicados del mismo `type + tmdbId` dentro de la misma lista.
- Añadir o quitar un título de una lista **no modifica automáticamente** el estado, favorito o valoración en las bibliotecas individuales.
- Los títulos se escogen desde el catálogo, no mediante texto libre.

### Ordenación de listas — aprobado

- Se admite **orden manual persistente** por arrastrar y soltar, con alternativas accesibles mediante teclado y controles táctiles.
- También se permite ordenar automáticamente por **título**, **fecha de incorporación** y **puntuación**.
- La ordenación automática no modifica ni sobrescribe el orden manual guardado.
- En listas colaborativas, propietario y editores pueden modificar el orden; los lectores no.
- Una misma lista puede contener títulos sin puntuación. El criterio concreto para ordenar esos casos debe quedar documentado antes de implementarse.
- **Votaciones de participantes en listas colaborativas:** aprobadas como funcionalidad **posterior al MVP**, no como forma de ordenación inicial.

**Pendiente de especificación:** flujo de alta de miembros, cambios entre modalidades, transferencia de propiedad y resolución de conflictos en ediciones concurrentes.

## 8. Privacidad de usuario — aprobado

Cada cuenta controla, **de forma independiente**, la visibilidad de:

1. **Biblioteca personal**.
2. **Valoraciones y reseñas**.
3. **Actividad reciente**.

**Valor inicial de los tres controles:** privado/desactivado.

- Compartir significa permitir el acceso solo a **usuarios registrados y autenticados**.
- Los permisos se aplican en backend tanto a listados como a consultas individuales, no solo ocultando elementos en React.
- Cambiar a privado revoca la visibilidad de las siguientes consultas; no es posible retirar información que otra persona ya haya visto previamente.
- Dar acceso a una lista concreta **no publica la biblioteca personal completa**.
- Si la actividad es visible, sus eventos no deben desvelar información cuya biblioteca o reseña de origen sea privada; esta regla debe especificarse al diseñar el feed.
- Las medias de comunidad solo incluyen valoraciones que sus autores permiten compartir.

### Estadísticas y privacidad — aprobado

- Las estadísticas del perfil **heredan** los controles ya existentes: películas vistas, series terminadas y pendientes dependen de la visibilidad de la biblioteca; la nota media personal depende de la visibilidad de las valoraciones.
- El propietario puede ver todas sus estadísticas. Para otros usuarios se ocultan las estadísticas vinculadas a datos privados; no se muestra un cero ficticio en su lugar.
- Evitar filtraciones indirectas mediante contadores o agregados en grupos pequeños forma parte de la revisión de privacidad.

**Pendiente de especificación:** quién aparece como «amigo» dentro del grupo de usuarios, cómo se combinan las preferencias de privacidad en el feed y si algún dato agregado podría permitir inferir notas individuales en comunidades pequeñas.

## 9. Fichas completas y experiencia de catálogo — aprobado

**Diseño:** opción mixta, con cabecera cinematográfica (imagen de fondo, cartel y título), pero con acciones prioritarias —añadir a biblioteca, marcar favorito y valorar— próximas a la parte superior, especialmente en móvil.

Las fichas de películas y series mostrarán, **cuando los datos estén disponibles y su uso esté permitido**:

- Sinopsis, título, título original, año, género, imágenes y puntuación TMDB.
- Datos específicos: duración y estreno en películas; temporadas y progreso en series.
- Director y equipo creativo pertinente, reparto principal con fotografías.
- Tráiler oficial o equivalente disponible.
- Plataformas de streaming para **España**, separadas en **suscripción**, **alquiler** y **compra**, utilizando nombres/logotipos y permitiendo que un proveedor aparezca en varias modalidades.
- Valoración personal, media GarquinsFilm, cantidad de puntuaciones visibles y reseñas autorizadas.

**Reproductor de tráiler:** ventana emergente dentro de GarquinsFilm, en formato 16:9 adaptado a móvil. El reproductor se carga solo tras una acción del usuario; no se reproduce automáticamente al abrir la ficha. Permite cerrar con control visible y Escape, detiene el vídeo al cerrarse y devuelve el foco al control de apertura. Si no hay tráiler compatible, no se ofrece la acción. Debe validarse el proveedor del vídeo antes de incrustarlo.

**Disponibilidad de streaming:** informativa y no necesariamente en tiempo real. No se muestran precios sin una fuente fiable; la falta de resultados se comunica como «Disponibilidad no disponible», nunca como una afirmación de que ningún servicio ofrece el título. La atribución y enlaces de fuente se ajustarán a los términos aplicables.

**Dependencia técnica:** la ampliación API se implementa localmente en `feature/tmdb-details` (TMDB-API-003), con `append_to_response` para créditos, vídeos y proveedores, contratos y reglas actualizados en `API_INTEGRATION.md` y backlog en `TASKS.md`. Pendiente de revisión, PR y CI. El modal y la presentación son WEB-CATALOG-002. TMDB-TERMS-001 sigue pendiente y bloquea datos reales; las pruebas usan exclusivamente mocks.

## 10. Consulta y presentación de la biblioteca — aprobado

La biblioteca tendrá **filtros combinables** por:

- Tipo de contenido (películas o series), estado y favoritos.
- Géneros, año o intervalo de años y puntuaciones personales (incluida la ausencia de puntuación).
- Búsqueda por título **dentro de la propia biblioteca**, distinta de la búsqueda general del catálogo.

Ofrecerá ordenación por fecha de incorporación, título, año de estreno y puntuación personal, entre otros criterios derivados de los campos anteriores. En móvil, los filtros avanzados podrán recogerse en un panel desplegable; esta disposición exacta sigue sujeta a pruebas de UX.

**Vistas disponibles:** cuadrícula de carteles y lista compacta. La **cuadrícula** será el valor por defecto y se recordará **por cuenta de usuario** la última vista seleccionada, también después de cerrar sesión. Cambiar de vista no altera filtros ni ordenación. Ambas vistas permiten abrir la ficha del título.

## 11. Notificaciones internas — aprobado

- Campana de notificaciones en la aplicación, con contador de elementos sin leer.
- Historial propio de cada usuario; consultar y marcar como leída una notificación no debe afectar a otras cuentas.
- Acción para marcar todas como leídas y acceso al contenido relacionado, si el usuario sigue autorizado a verlo.
- Eventos iniciales propuestos: lista compartida, cambio de permisos, incorporación de títulos a listas colaborativas y retirada de acceso, cuidando de no revelar información privada.
- La actualización puede realizarse al navegar o abrir el panel; **no se requieren WebSockets** para la primera versión.
- **Sin correos de actividad** durante el MVP. Los correos operativos de invitación y recuperación de contraseña se mantienen.
- Notificaciones push, votaciones y alertas de nuevas temporadas quedan para fases posteriores.

## 12. Perfiles y estadísticas — aprobado

Cada usuario tendrá un perfil con:

- **Nombre visible** editable, independiente de las credenciales de inicio de sesión.
- **Avatar** mediante opciones predeterminadas o imagen aportada por el usuario, sujeto a validación de tamaño, formato y almacenamiento seguro.
- **Descripción breve opcional** con límite de longitud por concretar.
- **Preferencias de privacidad** de biblioteca, valoraciones/reseñas y actividad, privadas por defecto.
- Correo no visible en el perfil para otros usuarios.
- Acceso a perfiles reservado a usuarios autenticados durante la primera etapa.

**Estadísticas básicas:** películas vistas, series terminadas, títulos pendientes (películas y series) y media de las puntuaciones personales disponibles. Los títulos sin nota no entran en la media; si no hay notas, se presenta «Sin valoraciones» y no una media de cero. El recuento corresponde a títulos, no a temporadas.

Las estadísticas se actualizan con los cambios de biblioteca y valoraciones, y **heredan los controles de privacidad** descritos en el apartado 8. Géneros favoritos, distribución de notas y gráficos de evolución son posibles ampliaciones, no requisitos aprobados para el MVP.

## 13. Fases sugeridas y dependencias

Estas fases ordenan el trabajo; **no declaran entregas realizadas ni establecen fechas comprometidas**.

| Orden orientativo | Entrega                                          | Dependencia / alcance                                                                                            |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1                 | TMDB-API-002 / TMDB-API-003                      | Búsqueda y fichas; completar la verificación de términos antes de activar datos reales                           |
| 2                 | WEB-CATALOG-001 / WEB-CATALOG-002                | Interfaz Mobile First de búsqueda y fichas; fichas completas sujetas a ampliación de contratos y atribución TMDB |
| 3                 | Inicio: tendencias y populares                   | Endpoints/datos de tendencias y populares aún por definir en backlog técnico                                     |
| 4                 | Biblioteca y seguimiento                         | Estados, favoritos y temporadas                                                                                  |
| 5                 | Valoraciones y reseñas                           | Escala 0,0–10,0 en pasos de 0,1, texto opcional, spoilers y privacidad                                           |
| 6                 | Listas compartidas y colaborativas               | Propietario, lectores, editores, control de permisos y orden manual/automático                                   |
| 7                 | Perfiles, estadísticas y notificaciones internas | Requiere biblioteca, valoraciones y mecanismos de privacidad/autorización                                        |
| 8                 | Inicio personal y actividad                      | Requiere biblioteca, privacidad y eventos autorizados                                                            |
| 9                 | Recomendaciones personalizadas                   | Requiere suficiente historial y validación de cumplimiento                                                       |
| Posterior         | Votaciones en listas colaborativas               | Fuera del MVP; reglas de votación aún por concretar                                                              |

**Nota:** esta tabla presenta un orden orientativo de desarrollo, no garantiza que todo forme parte del primer lanzamiento. La inclusión exacta de listas colaborativas, perfiles y notificaciones en el MVP debe cerrarse al planificar entregas. **Las votaciones sí quedan expresamente fuera del MVP.**

## 14. Criterios de aceptación funcionales de referencia

### Descubrimiento

- La interfaz identifica inequívocamente películas y series.
- Existen secciones diferenciadas de tendencias, películas populares y series populares cuando se implemente la portada de descubrimiento.
- Si faltan imágenes o TMDB no responde, la interfaz ofrece estados comprensibles sin filtrar datos internos.

### Fichas y reproducción

- Las acciones personales están accesibles cerca de la cabecera en móvil.
- Los datos de director, reparto, tráiler y proveedores se muestran solo si están disponibles y permitidos.
- El tráiler no se carga hasta que el usuario solicita reproducirlo; la ventana se puede cerrar y la reproducción se detiene.
- La disponibilidad en España distingue suscripción, alquiler y compra y no presenta ausencia de datos como ausencia de oferta.

### Biblioteca y series

- Al guardar un título, se elige su estado.
- Cambiar de estado conserva favorito, puntuación y reseña.
- Marcar una temporada como vista actualiza el progreso sin contar especiales.
- No se crean entradas duplicadas por usuario y título.

### Filtros, vistas y ordenación

- Los filtros de biblioteca son combinables y existe búsqueda dentro de la colección.
- La vista de carteles o lista se conserva por usuario tras volver a iniciar sesión.
- Cambiar de vista no altera filtros ni ordenación.
- El orden automático de una lista no destruye su orden manual persistente.
- Solo propietario y editores pueden cambiar el orden de una lista colaborativa.

### Perfil y notificaciones

- Cada usuario puede editar nombre visible y biografía; su correo no se expone en perfiles ajenos.
- Los recuentos de biblioteca no se revelan si esta es privada, y la nota media personal respeta la privacidad de valoraciones.
- Una cuenta no puede leer notificaciones de otra; los enlaces vuelven a comprobar permisos al abrir el destino.
- No se generan correos de actividad social en el MVP.

### Social y privacidad

- Un lector no puede editar listas, incluso llamando directamente a la API.
- Un editor no puede gestionar permisos ni eliminar la lista.
- Un usuario sin acceso no puede ver una lista privada.
- Desactivar visibilidad de valoraciones excluye esas notas de la media compartida y de las vistas individuales posteriores.
- RATINGS-002 no implementa compartir, medias comunitarias, perfiles, estadísticas públicas ni endpoints para consultar ratings ajenos; esas capacidades requieren diseño y autorización posteriores.
- La media indica el tamaño de la muestra y no usa votos de TMDB.
- El texto marcado como spoiler queda oculto en fichas y vistas previas hasta revelación voluntaria.

### Seguridad y datos

- Cada solicitud aplica comprobación de sesión y autorización adecuada.
- Ningún dato de TMDB se trata como propiedad del usuario; biblioteca, notas, reseñas y permisos son datos propios de GarquinsFilm.
- No se expone el token TMDB al cliente ni al repositorio.

## 15. Asuntos que siguen abiertos

- **TMDB-TERMS-001:** confirmar expresamente que el uso no comercial compartido con familia y unos pocos amigos, la normalización, almacenamiento limitado, atribución y eventual publicación en stores son compatibles con las condiciones aplicables. Disponer de credenciales no equivale a autorización para todos los usos.
- **ADR-006:** cierre de identidad visual definitiva.
- Requisitos detallados de novedades, tendencias, populares y algoritmo de recomendaciones.
- Identificación de «amigos» y alcance del feed social.
- Comportamiento ante series en emisión y nuevas temporadas.
- Reglas de edición simultánea, transferencia de propiedad y orden concurrente de listas colaborativas.
- Reglas definitivas de votaciones colaborativas, previstas para después del MVP.
- Retención de notificaciones, almacenamiento seguro de avatares y límites de campos de perfil.
- Tratamiento de datos de reparto, vídeos y proveedores de streaming bajo los términos vigentes y ampliaciones de contratos de catálogo.
- Políticas de borrado y exportación de reseñas/datos personales.
- Publicación en tiendas, PWA, distribución y proveedor de correo de producción.

## 16. Uso de este documento

Documento para **consolidar decisiones** y facilitar una futura actualización controlada de `docs/PRD.md`, `docs/USER_FLOWS.md`, `docs/DATA_MODEL.md`, `docs/TASKS.md` y `docs/ROADMAP.md`.

No reemplaza automáticamente los ADR ni los contratos técnicos existentes; en caso de discrepancia hay que revisarla antes de implementar. **No debe marcarse ninguna funcionalidad como completada hasta integrarla mediante PR validada.**
