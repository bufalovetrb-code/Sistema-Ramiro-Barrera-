# Reglas de validación

- Evento: fecha/hora y tipo obligatorios; el animal debe existir; la fecha no puede ser previa al nacimiento.
- Diagnóstico: requiere resultado. Un diagnóstico gestante requiere fecha de servicio.
- Animal: ID visible obligatorio; RFID y arete no se pueden duplicar cuando existen.
- Parto: madre, fecha/hora y tipo obligatorios. Solo se valida si existe una gestación activa de la misma madre. Si falta esa gestación o se adelanta más que la tolerancia respecto a la fecha probable, se conserva en revisión con su razón visible.
- Cría: solo se crea tras pulsar `Crear cría` en un parto validado; el vínculo del parto evita duplicarla.
- Baja: se registra como baja lógica y mantiene eventos, partos y auditoría.
