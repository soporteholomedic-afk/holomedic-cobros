# Guía: explorar y visualizar el código fuente de SIGLA

> **Dónde correr esto:** en la PC que tiene el código (`C:\Users\soporte\Desktop\SIGLA`).
> **Objetivo:** entender arquitectura y flujos del ERP para alimentar el diseño del módulo de
> compras/inventario/activos de holomedic-cobros. Todos los comandos son PowerShell.

## 0. Contexto ya verificado (no hay que redescubrirlo)

- SIGLA es un ERP .NET en capas. El runtime compilado (`sigla-cli/`) delata la estructura:
  `Datos.dll` (acceso a datos), `Entidad.dll` (entidades), `Negocio.dll` (reglas de negocio),
  más `rpt/` con plantillas Crystal Reports.
- La base SIGLA vive en `SVRDB01` (172.16.10.14) y tiene 270 tablas.
- Verificado en vivo (septiembre 2026): **no hay tablas de órdenes de compra** (la familia
  `Orden*` es clínica: muestras, CIE10, fichas) **ni de activos fijos**.
- El módulo de inventario existe en estructura (`Tbl_MovimientoInsumo` tiene `NroLot`,
  `FecVen`, `CodAlO`, `CanRec`) pero está **sin usar**: 0 movimientos, 0 stock.
- Maestros vivos: `Proveedor` (63, con RUC), `Tbl_Insumo` (317) + tipos/subtipos/unidades,
  `Tbl_Almacen` (2, con campo `IdSIGA`).

## 1. Preparación (una sola vez)

```powershell
# VS Code + extensión C# (si no hay Visual Studio a mano)
winget install Microsoft.VisualStudioCode
# Dentro de VS Code: instalar extensión "C# Dev Kit"

# ripgrep para búsquedas rápidas (recomendado)
winget install BurntSushi.ripgrep.MSVC

# Abrir el código
code C:\Users\soporte\Desktop\SIGLA
```

Si el agente IA que uses en esa PC no tiene permisos sobre la carpeta, recuérdale que
`C:\Users\soporte\Desktop\SIGLA` está explícitamente autorizado en el AGENTS.md de
holomedic-cobros (lectura/escritura autorizada por el maintainer).

## 2. Mapa de la solución (primeros 10 minutos)

```powershell
# Encontrar la solución y los proyectos
Get-ChildItem -Recurse -Filter *.sln | Select-Object -ExpandProperty FullName
Get-ChildItem -Recurse -Include *.csproj,*.vbproj | Select-Object -ExpandProperty FullName
```

Con el `.sln` abierto en VS Code (C# Dev Kit), el *Solution Explorer* muestra los proyectos.
Verificar el orden de dependencias esperado y anotar si difiere:

```
UI (WinForms/Web) → Negocio → Datos → Entidad → BD SIGLA
```

Si difiere (por ejemplo: UI habla directo con Datos, o hay servicios/WS en el medio),
eso ES un hallazgo — documentarlo.

## 3. Las 4 recetas de trazado que revelan cómo funciona

**R1 — Empezar por la tabla (la más efectiva).** Buscar el nombre de tabla encuentra en un
paso el form, la regla de negocio y el SQL que la tocan:

```powershell
rg -l "Tbl_MovimientoInsumo"
rg -l "Proveedor" --glob "*.cs"
```

**R2 — Trazar un flujo completo.** Desde el evento del formulario → método de Negocio →
método de Datos → SQL o stored procedure. En VS Code: clic derecho sobre un método →
*Find All References* / *Go to Definition* (F12).

**R3 — Encontrar la capa de acceso a datos:**

```powershell
rg -l "SqlConnection|connectionString|CommandText"
```

**R4 — Cómo generan códigos correlativos** (crítico para nuestro `ACT-YYYY-NNN`):

```powershell
rg -i "correlativ|MAX\(|IDENT_CURRENT|SCOPE_IDENTITY"
```

## 4. Visualización

- **VS Code (C# Dev Kit):** *Solution Explorer*, *Go to Definition*, *Find All References*,
  y *Call Hierarchy* (clic derecho → *Show Call Hierarchy*) — la vía rápida.
- **Visual Studio:** *Code Map* y *Class Diagram* generan diagramas de dependencia reales.
- **Rápido con IA:** después de rastrear un flujo con R1/R2, pedirle al agente un diagrama
  Mermaid/PlantUML de ese flujo (secuencia UI → Negocio → Datos → BD).

## 5. Checklist — lo que la exploración DEBE responder (alimenta el diseño del módulo)

1. ¿Existe alguna pantalla que escriba `Tbl_MovimientoInsumo`? ¿Con qué validaciones?
   ¿Lote/vencimiento obligatorios ahí?
2. Semántica exacta de columnas: `CodAlO` vs `CodAlm` (¿origen/destino en transferencias,
   dado `TipoMovimiento.IndTra`?), `CanRec` vs `CanMov` (¿recibido vs movido?).
3. ¿`Proveedor` participa de algún flujo operativo o es solo catálogo?
4. ¿Cómo genera la app sus códigos/correlativos? (para no chocar con `ACT-YYYY-NNN`).
5. ¿Hay lógica de alertas por vencimiento ya implementada en Negocio?
6. Confirmar al 100% que no hay módulo de compras oculto en UI:
   `rg -i "compra|cotiza|pedido" --glob "*.cs"` y revisar menús/forms.
7. ¿Qué rol juegan los `rpt/*.rpt` y desde dónde se invocan?

## 6. Prompt listo para un agente IA en esa PC

```
Eres un analista de código senior. Explora la solución .NET en
C:\Users\soporte\Desktop\SIGLA (solo lectura, no modifiques nada).

Contexto verificado: ERP en capas (UI → Negocio → Datos → Entidad), BD SQL Server
"SIGLA" en 172.16.10.14 con 270 tablas. No hay órdenes de compra ni activos fijos en la
BD. El kardex Tbl_MovimientoInsumo (con NroLot/FecVen) existe pero está vacío.

Tareas:
1. Lista los proyectos del .sln y su rol (UI/Negocio/Datos/Entidad/otros).
2. Con "rg -l <tabla>" ubica qué clases/forms tocan: Tbl_MovimientoInsumo, Proveedor,
   Tbl_Insumo, Tbl_Almacen, TipoMovimiento.
3. Trazar el flujo completo (form → Negocio → Datos → SQL) de CUALQUIER pantalla que
   escriba movimientos de inventario. Si no existe, dilo con evidencia.
4. Responde el checklist de la sección 5 de la guía con evidencia (archivo:línea).
5. Devuelve 2 diagramas Mermaid: (a) arquitectura de proyectos con dependencias,
   (b) secuencia del flujo de inventario encontrado.

Reglas: nunca uses el login "sa" para nada; si consultas la BD es solo con el perfil
read-only; no ejecutes la aplicación; no modifiques archivos del ERP.
```

## 7. Reglas de seguridad

- Exploración de código: **solo lectura**.
- Exploración de BD: **solo perfil `explorar_datos`** — nunca `sa` (regla del AGENTS.md).
- No ejecutar la app contra producción ni restaurar backups sin permiso explícito.
