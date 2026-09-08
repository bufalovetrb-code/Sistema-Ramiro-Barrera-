# Estados del ciclo

`Servicio`, `Celo` o un registro inicial abren un ciclo en **Pendiente de diagnóstico**. Un diagnóstico válido con resultado `Gestante` lo cambia a **Gestación activa** y calcula el parto probable según la especie. Un diagnóstico válido `Vacía` lo cambia a **Vacía**.

Un aborto válido termina el ciclo en **Aborto**. Un parto válido termina el ciclo en **Cerrado por parto**. Cualquier servicio o diagnóstico posterior a dicho cierre abre un ciclo distinto. Eventos o partos incompletos, con fecha anterior al nacimiento o con un parto demasiado anticipado pasan el ciclo a **Requiere revisión** y conservan su razón visible.
