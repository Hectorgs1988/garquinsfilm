# Seguridad y privacidad — MVP

- Better Auth es la solución para email/contraseña y sesiones. El core está integrado con Better Auth/adaptador Prisma 1.7.11, Fastify 5.12.7 y Prisma 7.10.1; la migración y los flujos se probaron contra PostgreSQL 17 efímero aislado. Repetir la validación en CI y tras cualquier actualización de versiones. No implementar credenciales, sesiones ni criptografía artesanal como sustituto.
- El registro público estará deshabilitado. Solo se crearán cuentas mediante invitaciones válidas, emitidas exclusivamente por administradores.
- Vincular cada invitación a un email normalizado. Generar un token aleatorio de alta entropía y almacenar únicamente su hash; expira a los 7 días y se acepta una sola vez. La aceptación debe ser atómica y resistir solicitudes concurrentes. No exigir verificación adicional del correo después de aceptar correctamente la invitación.
- Los roles globales son `admin` y `user`; solo el servidor puede asignarlos. Rechazar cualquier intento de asignación o elevación desde parámetros enviados por el navegador. La propiedad de listas compartidas es independiente del rol global.
- Crear el primer administrador solo mediante un procedimiento local controlado, nunca mediante endpoint público.
- Configurar sesiones seguras y cookies con atributos HttpOnly, Secure y SameSite según el entorno. Mantener CSRF y comprobaciones de origen habilitados; no desactivar estas protecciones.
- Aplicar rate limiting a autenticación, recuperación e invitaciones; evitar respuestas que faciliten enumeración de usuarios.
- Para desarrollo local se usará Mailpit con Docker. Las pruebas automatizadas deben usar un remitente simulado y nunca enviar correos reales. No se ha aprobado un proveedor remoto.
- Validar entradas y aplicar autorización en servidor para cada operación sobre biblioteca, valoraciones, progreso y listas.
- Las valoraciones solo se crean para títulos en la biblioteca personal. Un usuario no puede leer ni modificar los datos personales de otro.
- Invitaciones de un solo uso con token aleatorio almacenado como hash y fecha de vencimiento.
- Secretos en variables de entorno del servidor o gestor de secretos; `.env` real fuera del control de versiones. No introducir credenciales reales en archivos versionados.
- Controlar dependencias, ejecutar CI, limitar CORS y generar logs sanitizados. No registrar contraseñas, cookies, tokens de sesión/invitación ni datos personales innecesarios.
- Preparar política de borrado y exportación de datos; revisar RGPD si hay usuarios reales.
- Revisar términos, atribución, uso de imágenes y caché de TMDB antes de producción.
- Hosting, TLS, backups y procedimientos de restauración para staging/producción siguen pendientes.

## Pruebas de seguridad que bloquean entrega

Usuario A no puede leer/modificar la biblioteca, valoraciones o progreso de B; ver listas privadas sin pertenencia; editar una lista tras ser eliminado; ni cambiar roles sin permiso. El registro sin invitación, la emisión de invitaciones por usuarios no administradores y la elevación de rol desde el cliente deben rechazarse. Invitaciones vencidas o ya consumidas, incluidas aceptaciones concurrentes, no deben crear más de una cuenta. Los miembros pueden añadir y retirar títulos, pero no administrar miembros ni eliminar la lista. Contraseñas, cookies, sesiones e invitaciones no deben aparecer en logs ni respuestas API. Solicitudes de origen no confiable no deben omitir las protecciones CSRF.
