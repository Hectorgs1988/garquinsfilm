# Flujos principales de usuario

| ID | Flujo | Resultado observable |
|---|---|---|
| F01 | Administrador emite invitación → destinatario acepta dentro de 7 días → crea cuenta con email/contraseña → inicio | Invitación ligada al email normalizado, consumida atómicamente una vez; sesión autenticada mediante Better Auth tras validar la integración; perfil propio con rol `user` asignado por servidor y sin verificación adicional de email |
| F01A | Intentar registro público, aceptar invitación vencida/usada o emitir invitación sin ser administrador | Operación rechazada; no se crea cuenta ni se revela información sensible |
| F01B | Procedimiento local controlado crea primer administrador | Cuenta inicial con rol `admin`; no existe endpoint público de bootstrap |
| F01C | Login → logout | Inicio de sesión limitado por rate limiting; cierre invalida la sesión y elimina la cookie de forma segura |
| F02 | Buscar → ficha → añadir a pendientes | Una única entrada en biblioteca |
| F03 | Biblioteca → título guardado → marcar visto → valorar | Cambia estado; se guarda nota válida entre 0,0 y 10,0 en incrementos de 0,1 |
| F04 | Ficha de serie → añadir a biblioteca → marcar temporada completa | Progreso propio por temporadas actualizado |
| F05 | Crear lista → agregar miembro existente → agregar/quitar título | Miembro autorizado puede colaborar; propietario administra miembros |
| F06 | Lista compartida → título → guardar en biblioteca propia | Lista compartida permanece intacta |
| F07 | Rankings → filtrar → añadir a pendientes | Título agregado sin duplicado; fuente y criterios visibles |
| F08 | Biblioteca → ordenar por nota descendente | Ranking personal correcto |
| F09 | Login → solicitar recuperación → seguir instrucciones recibidas por correo | Recuperación segura, con respuestas que no permiten enumerar cuentas; desarrollo manual mediante Mailpit y pruebas automatizadas con remitente simulado |

## Errores y alternativas obligatorias

- Sesión caducada: redirigir a login sin exponer datos privados.
- Título ya guardado: mostrar acción de edición o aviso, sin duplicarlo.
- Intento de valorar un título que no está en la biblioteca: rechazar la operación y ofrecer añadirlo primero.
- Usuario no miembro de lista: respuesta 403/404 indistinguible según estrategia documentada.
- Miembro que intenta administrar miembros o eliminar la lista: rechazar; esas acciones corresponden al propietario.
- TMDB lento o no disponible: error recuperable sin perder datos propios.
- Serie sin temporadas normales: el progreso no divide entre cero.
- Nota fuera de rango o con precisión inválida: validación cliente y servidor.
- Si el canal de correo local no está disponible/configurado, el envío de invitación o recuperación no se considera exitoso; no simular el envío real. Los tests automatizados usan un remitente simulado y no envían correo.
- Invitación concurrente: solo una solicitud puede consumirla y crear una cuenta.
- Intento de elevar o asignar un rol desde el navegador: ignorar o rechazar el valor; la autorización usa el rol persistido y controlado por servidor.
- Solicitud con origen no confiable: mantener activas las comprobaciones de origen/CSRF; no aceptar una configuración permisiva para hacer pasar el flujo.

## Criterios mínimos por pantalla

Búsqueda: debounce, sin resultados, carga, fallo. Ficha: diferencia de película/serie; acciones según sesión y estado de biblioteca. Biblioteca: filtros, orden y vacíos. Listas: miembros, permisos y confirmación para eliminación. Temporadas: estado individual por usuario. Rankings: fuente y filtros visibles; ranking de películas conforme a ADR-005. Las reglas de ranking de series siguen pendientes.
