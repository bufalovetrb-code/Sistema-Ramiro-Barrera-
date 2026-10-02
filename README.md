# RB SmartFarm – Reproducción

PWA local para gestionar animales, eventos reproductivos, ciclos, partos y alertas de bovinos y búfalos.

## Ejecutar en PC

1. Abra una terminal en esta carpeta.
2. Ejecute `pnpm dev`.
3. Abra la dirección local que muestra la terminal.

## Paquete 5: búsqueda, reportes e impresión

- En **Animales**, la búsqueda local encuentra animales activos por ID visible,
  RFID o arete. Los filtros por grupo, especie y estado reproductivo se pueden
  combinar con esa búsqueda.
- En **Indicadores**, el período y la especie delimitan los indicadores
  reproductivos. El botón **Imprimir reporte** abre el diálogo de impresión del
  navegador con el resultado que se está consultando.
- Cada **Ficha técnica** incluye el botón **Imprimir ficha**. La impresión
  contiene los datos de identificación, categoría, estado reproductivo,
  ubicación, vínculo materno, crías y destete cuando esos registros existen.

La impresión es local: el navegador permite elegir una impresora o guardar un
PDF. No envía información a servicios externos.

## Abrir o instalar en Android

1. Publique el build de producción detrás de una URL HTTPS confiable y accesible desde el teléfono. No active integraciones externas; para esta prueba basta el servidor HTTPS de QA autorizado por la organización.
2. Abra esa URL en Chrome Android y use **Instalar aplicación** o **Añadir a pantalla principal**.
3. Abra una vez con conexión para guardar el shell de la app. Luego puede trabajar offline: los datos están en IndexedDB de ese dispositivo.

`pnpm dev --host 0.0.0.0` sirve para desarrollo en red, pero no certifica instalación Android: el navegador exige HTTPS confiable para registrar el service worker fuera de `localhost`.

### Prueba de instalación y reapertura offline

1. En Chrome Android, abra la URL HTTPS de QA y compruebe que Chrome muestra **Instalar aplicación**.
2. Instálela y ábrala desde el icono “RB SmartFarm”. Confirme que abre en ventana independiente y conserva los datos registrados en ese dispositivo.
3. Con la app abierta una vez, active el modo avión o desactive Wi‑Fi/datos móviles.
4. Cierre por completo y vuelva a abrir la PWA desde el icono. Deben aparecer la interfaz y los datos locales.
5. Registre un evento de prueba sin conexión, cierre y abra nuevamente: debe mantenerse en este mismo dispositivo.

## Auditoría de GPT Work

1. Ejecute `pnpm test`, `pnpm run typecheck`, `pnpm build` y `pnpm lint`.
2. Registre un animal de prueba en **Animales** y confirme que aparece en la lista.
3. Registre un servicio y un diagnóstico gestante para ese animal; confirme que aparece su ciclo.
4. Registre un parto válido y confirme que el ciclo se cierra.
5. Pruebe navegación, formularios y tablas en ancho móvil y escritorio.

## Alcance actual

La aplicación conserva una copia de trabajo local en IndexedDB para poder operar sin conexión y ofrece respaldo descargable en formato JSON. Los respaldos locales siguen siendo obligatorios.

También cuenta con sincronización manual con Supabase para una finca seleccionada. La sincronización registra los cambios compatibles, descarga la versión remota y conserva la versión remota cuando detecta un conflicto para evitar sobrescribir información.

Los usuarios acceden mediante Supabase Auth. Una finca puede compartirse con los roles **propietario**, **administrador**, **operador** y **solo lectura**. Los roles de propietario, administrador y operador pueden registrar información; solo lectura puede consultar sin modificarla.

Para publicar una versión con sincronización remota se requieren las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca incorpore claves de servicio ni contraseñas al repositorio.
