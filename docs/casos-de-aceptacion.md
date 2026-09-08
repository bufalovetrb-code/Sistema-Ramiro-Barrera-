# Casos de aceptación

- A0001 se muestra como `Requiere revisión` por su evento anterior al nacimiento.
- A0002 se muestra como `Vacía`.
- A0003 se muestra como `Gestación activa`.
- A0004 se muestra como `Requiere revisión` por diagnóstico incompleto.
- Un parto válido cierra una gestación activa.
- Un nuevo servicio posterior a un parto abre otro ciclo.
- Reordenar una lista no altera estados ni UUID.
- La interfaz tiene navegación móvil y escritorio; tras instalar, el service worker mantiene disponible la aplicación y IndexedDB conserva los datos locales.
- Un parto para A0002, que está vacía, queda en revisión como `Parto sin gestación activa`.
- Un parto sin tipo no pasa la validación de formulario ni de dominio.
- Un parto anticipado queda en revisión y un parto posterior a un ciclo ya revisado no lo cierra automáticamente.
- Auditoría permite filtrar por entidad y acción, y abrir el módulo asociado a cada registro.
