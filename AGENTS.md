# RB SmartFarm – Reproducción

## Comandos

- `pnpm dev`: iniciar la aplicación local.
- `pnpm test`: ejecutar pruebas unitarias, de integración y de interfaz.
- `pnpm build`: validar el empaquetado de producción.
- `pnpm lint`: revisar el código.

## Reglas de calidad

- No eliminar ni sobrescribir el libro Excel operativo; solo es una especificación de referencia.
- Mantener UUID internos inmutables para animales, eventos, partos, crías y auditoría.
- La baja de animales es lógica y conserva la historia.
- El orden visual de listas jamás define un estado reproductivo.
- Mostrar incoherencias como `Requiere revisión`; nunca corregirlas ni ocultarlas automáticamente.
- Probar los cuatro casos A0001–A0004 antes de entregar cambios en la lógica de ciclos.

## Reglas de negocio

- Diagnóstico positivo activa un ciclo; diagnóstico `Vacía` lo deja vacío.
- Parto validado o aborto cierran el ciclo.
- Un evento posterior al cierre crea un ciclo nuevo.
- Gestación bovina: 283 días. Gestación bufalina: 310 días.
- Parto próximo: 30 días. Diagnóstico posservicio: 45 días. Tolerancia de parto anticipado: 45 días.
- No realizar integraciones externas. Una futura integración con Google Drive, Sheets o Gmail será exclusivamente por Composio, limitada a `bufalovetrb@gmail.com`.
