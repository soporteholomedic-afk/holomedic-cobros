# Entorno demo del CRM (BD independiente en :3001)

Entorno de prueba **permanente y aislado de producción** para probar el CRM con datos
ficticios: un contenedor SQL Server con dos bases (`SIGLA_DEMO` con Cliente/Orden falsos
y `HOLO_DEMO` con las migraciones reales del proyecto) y un servidor Next.js en el
puerto 3001 apuntando a esas bases.

- **URL**: http://localhost:3001/crm — LAN: http://172.16.10.20:3001/crm
- **Login**: tu usuario real (la fila de `dbo.usuarios` se copia desde la BD real al
  levantar el entorno; el permiso `crm` se agrega en el demo si falta).
- **Producción jamás se toca**: el bootstrap solo hace `SELECT` contra la BD real.

## Datos demo

| Segmento | Contenido |
|---|---|
| Con ficha en el CRM | 5 inactivas (7 / 5 / 4 meses y una pendiente de primera atención) + sectores facetados |
| Solo en SIGLA | 130 clientes generados con antigüedades de 3 a 14 meses (3 páginas de paginación) + 10 pendientes de primera |
| Curados | 1 reciente (no aparece), 1 cliente sin RUC (contador), 1 prospecto (fuera), 3 oportunidades, 2 interacciones |

## Cómo levantarlo

1. **Contenedor SQL Server** (si no está corriendo):

```bash
docker run -d --name mssql-demo-inactivas --restart unless-stopped \
  -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Demo-Inactivas-2026" \
  -e "MSSQL_PID=Developer" -e "MSSQL_MEMORY_LIMIT_MB=1200" \
  -p 14333:1433 --memory 1500m mcr.microsoft.com/mssql/server:2022-latest
```

2. **Bootstrap** (crea las bases, corre las migraciones reales del proyecto, siembra
   datos y copia el usuario de login — solo lectura desde producción):

```bash
cd /home/sysadmin/DEV/holomedic-cobros
cp temp/demo-inactivas.ts temp/demo-inactivas.test.ts
printf "\nimport { test } from 'vitest';\ntest('bootstrap', () => {});\n" >> temp/demo-inactivas.test.ts
DEMO_SA_PASS='Demo-Inactivas-2026' DEMO_USER='soporte' pnpm exec vitest run temp/demo-inactivas.test.ts
```

3. **Servidor en :3001** (desde el checkout de `develop`; los overrides de entorno
   apuntan al contenedor — el `.env.local` real queda intacto):

```bash
setsid nohup env DB_HOST=localhost DB_PORT=14333 DB_USER=sa DB_PASSWORD='Demo-Inactivas-2026' \
  DB_NAME=SIGLA_DEMO HOLOMEDIC_DB_HOST=localhost HOLOMEDIC_DB_PORT=14333 HOLOMEDIC_DB_USER=sa \
  HOLOMEDIC_DB_PASSWORD='Demo-Inactivas-2026' HOLOMEDIC_DB_NAME=HOLO_DEMO \
  pnpm exec next dev --hostname 0.0.0.0 --port 3001 > /tmp/dev-3001-demo.log 2>&1 < /dev/null &
```

## Cómo resetearlo

```bash
docker rm -f mssql-demo-inactivas   # borra los datos demo
# y vuelve a ejecutar los pasos 2 y 3
```

## Notas

- El contenedor tiene `--restart unless-stopped`: sobrevive reinicios del server.
- El servidor :3001 se lanzó desacoplado (`setsid nohup`): sigue vivo al cerrar esta
  sesión; tras un reinicio del server, relanzar con el comando del paso 3.
- **Nunca** uses las credenciales `sa` del demo contra producción, y jamás apuntes los
  overrides de entorno a las bases reales para "probar cosas": producción solo se
  consulta en lectura (perfil explorador).
- La instancia de :3000 es la de producción (datos reales); este :3001 es tu sandbox.
