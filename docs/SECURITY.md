# Seguridad y privacidad — MVP

- Better Auth es la solución aprobada para email/contraseña y sesiones; validar compatibilidad con Fastify y Prisma antes de integrarla. No implementar credenciales, sesiones ni criptografía artesanal como sustituto.
- Configurar sesiones seguras y cookies con atributos HttpOnly, Secure y SameSite según el entorno; aplicar protección CSRF cuando corresponda. La configuración concreta debe seguir la guía de Better Auth y quedar probada.
- Registro por invitación, recuperación de contraseña y cierre de sesión. El proveedor/canal de correo está pendiente; no configurar un servicio externo hasta su aprobación.
- Aplicar rate limiting en autenticación, recuperación e invitaciones; evitar respuestas que faciliten enumeración de usuarios.
- Validar entradas y aplicar autorización en servidor para cada operación sobre biblioteca, valoraciones, progreso y listas.
- Las valoraciones solo se crean para títulos en la biblioteca personal. Un usuario no puede leer ni modificar los datos personales de otro.
- Invitaciones de un solo uso con token aleatorio almacenado como hash y fecha de vencimiento.
- Secretos en variables de entorno del servidor o gestor de secretos; `.env` real fuera del control de versiones.
- Controlar dependencias, ejecutar CI, limitar CORS y generar logs sanitizados. No registrar contraseñas, cookies, tokens de sesión/invitación ni datos personales innecesarios.
- Preparar política de borrado y exportación de datos; revisar RGPD si hay usuarios reales.
- Revisar términos, atribución, uso de imágenes y caché de TMDB antes de producción.
- Hosting, TLS, backups y procedimientos de restauración para staging/producción siguen pendientes.

## Pruebas de seguridad que bloquean entrega

Usuario A no puede leer/modificar la biblioteca, valoraciones o progreso de B; ver listas privadas sin pertenencia; editar una lista tras ser eliminado; ni cambiar roles sin permiso. Los miembros pueden añadir y retirar títulos, pero no administrar miembros ni eliminar la lista. Contraseñas, sesiones e invitaciones no deben aparecer en logs ni respuestas API.
