# Base de Compras — División Comercial DNSFFAA

App web con login (usuarios y contraseñas), roles de administrador/operador,
base de datos en la nube (Supabase) y exportación a Excel/CSV.

## Ya configurado

Este proyecto ya está conectado a tu base de datos de Supabase:
- Project URL: `https://vzkcwigqwqvpxuddoeij.supabase.co`
- Clave pública incluida en `src/supabaseClient.js`

## Estructura del proyecto

```
compras-divcom/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx          → punto de entrada
│   ├── App.jsx            → la app completa (dashboard, tablas, formularios)
│   ├── Login.jsx          → pantalla de inicio de sesión / registro
│   ├── supabaseClient.js  → conexión a la base de datos
│   └── index.css
```

## Próximos pasos (los vamos a hacer juntos)

1. **Subir este código a GitHub** (Paso 4)
2. **Publicar en Netlify** conectado a ese repositorio (Paso 5)
3. **Cargar los datos iniciales** ejecutando `02_carga_datos_iniciales.sql` en el SQL Editor de Supabase
4. **Crear tu usuario administrador** y los usuarios operadores (Paso 6)

## Notas técnicas

- Hecho con React + Vite
- Base de datos: PostgreSQL en Supabase, con seguridad por fila (RLS)
- Los cambios se sincronizan en tiempo real entre todos los usuarios conectados
- Roles: el primer usuario que se registre puede ser promovido a "admin" manualmente desde Supabase (Table Editor → perfiles → editar columna `rol`)
