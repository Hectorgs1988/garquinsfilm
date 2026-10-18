# Seguridad y privacidad — MVP

- Cuentas separadas: usuario/email y contraseña con hash moderno adaptativo (Argon2id recomendado si se implementa internamente); nunca almacenar claves en claro.
- Preferir cookies HttpOnly, Secure, SameSite y protección CSRF cuando corresponda; política de sesiones y expiración.
- Rate limiting en login, recuperación e invitaciones; respuestas que no faciliten enumeración de usuarios.
- Aplicar validación de entrada y autorización en servidor para cada operación sobre biblioteca, valoraciones y listas.
- Invitaciones de un solo uso con token aleatorio almacenado mediante hash y fecha de vencimiento.
- Secretos en variables de entorno del servidor/gestor de secretos; `.env` fuera del control de versiones.
- Controlar dependencias, ejecutar CI, limitar CORS y generar logs sanitizados.
- Preparar política de borrado y exportación de datos; revisar RGPD si hay usuarios reales.
- Antes de abrir el registro al público: protección ante abuso y revisión de privacidad.

## Pruebas de seguridad que bloquean entrega
Usuario A no puede leer/modificar biblioteca de B, ver listas privadas sin pertenencia, editar una lista si fue eliminado, o cambiar roles sin permiso. Contraseñas e invitaciones no deben aparecer en logs ni en respuestas API.
