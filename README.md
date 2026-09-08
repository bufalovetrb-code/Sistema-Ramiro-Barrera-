# RB SmartFarm – Reproducción

PWA local para gestionar animales, eventos reproductivos, ciclos, partos y alertas de bovinos y búfalos.

## Ejecutar en PC

1. Abra una terminal en esta carpeta.
2. Ejecute `pnpm dev`.
3. Abra la dirección local que muestra la terminal.

## Abrir o instalar en Android

1. Conecte el teléfono y el PC a la misma red.
2. Ejecute `pnpm dev --host 0.0.0.0` y abra desde Chrome Android la dirección de red indicada por la terminal.
3. En Chrome, use **Instalar aplicación** o **Añadir a pantalla principal**.
4. Abra una vez con conexión para guardar el shell de la app. Luego puede trabajar offline: los datos están en IndexedDB de ese dispositivo.

### Prueba de instalación y reapertura offline

1. En Chrome Android, abra la aplicación y compruebe que Chrome muestra **Instalar aplicación**.
2. Instálela y ábrala desde el icono “RB SmartFarm”. Confirme que abre en ventana independiente y conserva A0001–A0004.
3. Con la app abierta una vez, active el modo avión o desactive Wi‑Fi/datos móviles.
4. Cierre por completo y vuelva a abrir la PWA desde el icono. Deben aparecer la interfaz y los datos locales.
5. Registre un evento de prueba sin conexión, cierre y abra nuevamente: debe mantenerse en este mismo dispositivo.

## Auditoría de GPT Work

1. Ejecute `pnpm test`, `pnpm run typecheck`, `pnpm build` y `pnpm lint`.
2. Compruebe los cuatro datos de muestra A0001–A0004 en **Ciclos**.
3. Registre un parto válido para A0003 y confirme que el ciclo se cierra.
4. Registre después un servicio para A0003 y confirme que aparece un nuevo ciclo.
5. Pruebe navegación, formularios y tablas en ancho móvil y escritorio.

## Alcance actual

No hay sincronización remota, usuarios autenticados ni integraciones externas. La capa de repositorio está preparada para sustituir IndexedDB por una API futura.
