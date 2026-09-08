# Modelo de datos

La app separa la interfaz de la persistencia mediante `LocalFarmRepository`. La implementación actual guarda un único agregado de finca en IndexedDB; una API futura puede implementar el mismo contrato.

- `Animal`: UUID interno, identificador visible, RFID/arete únicos cuando se informan, especie, sexo, nacimiento, ubicación, estado y baja lógica.
- `ReproductiveEvent`: UUID inmutable, animal, fecha/hora, tipo, resultado, fechas de servicio/diagnóstico, validez y causas de revisión.
- `Cycle`: entidad derivada que conserva el animal, inicio, eventos vinculados, estado, fecha probable de parto y cierre.
- `Birth`: UUID inmutable, madre, fecha/hora, tipo, sexo, condición, asistencia, validación, vínculo opcional a la cría.
- `AuditEntry`: creación, edición, baja o corrección con fecha, usuario local y motivo.
- `Settings`: valores configurables de gestación, alertas y validación.

Los identificadores internos no dependen del orden de las listas. Los datos de muestra conservan A0001–A0004 como IDs visibles para trazabilidad con el libro operativo.
