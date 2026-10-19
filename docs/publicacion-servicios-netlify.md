# Publicación de servicios RB SmartFarm

La aplicación reproductiva y la página comercial se publican desde el mismo proyecto.

- Aplicación operativa: `/`
- Página comercial para el QR: `/servicios`
- URL temporal activa: `https://sistema-ramiro-barrera-rbgi.netlify.app/servicios`
- URL profesional prevista: `https://rbsmartfarm.co/servicios`

## Migración sin romper los QR

1. Publicar esta rama en el sitio existente `sistema-ramiro-barrera-rbgi`.
2. Probar la ruta `/servicios` y la aplicación existente `/` en computador y teléfono.
3. Usar la URL de Netlify para pruebas digitales. No imprimir tarjetas definitivas aún.
4. Registrar el dominio elegido y agregarlo al mismo sitio en **Domain management** de Netlify.
5. Configurar `rbsmartfarm.co` como dominio principal y una redirección permanente desde `sistema-ramiro-barrera-rbgi.netlify.app`.
6. Generar el QR final con la URL profesional. Los QR temporales seguirán funcionando por la redirección.

Nunca se deben crear dos despliegues distintos para la app y los servicios: las dos rutas salen del mismo build y del mismo sitio Netlify.
