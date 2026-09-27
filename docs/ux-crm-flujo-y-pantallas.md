# Diseño de UX — Flujo de uso y pantallas del CRM

> Estado: **borrador para revisión** (v2 — reencuadrado). Base: investigación con 3 agentes (patrones CRMs líderes, flujos de seguimiento, auditoría de código) + skill `ui-ux-pro-max`.
> Worktree: `feature/crm-ux-redesign` · Stack real: Next.js 16 App Router, React 19, Tailwind CSS 4 (CSS-first).

---

## 1. Objetivo y alcance

Diseñar el **flujo de uso** y las **pantallas** del CRM comercial de salud ocupacional: la herramienta para **contactar clientes y prospectos** — registrar empresas, clasificarlas, asignarlas a gestores, hacerles seguimiento con cadencias de contacto y avanzarlas por el pipeline comercial hasta convertir.

**Fuera de alcance**: el módulo legado `/cobranza` (carga de saldos y dashboard de deudores) es otro dominio y no se rediseña acá.

**Fuente de verdad del estado actual** (auditoría 2026-09-26): sidebar plano donde "CRM" es un solo link que esconde 7 páginas; sin búsqueda global, sin atajos, sin feedback de éxito (0 toasts), filtros que no persisten, cola sin acciones inline (cada empresa exige navegar al detalle), asignación de gestores a texto libre, tablas sin paginar ni ordenar.

---

## 2. Personas

| Persona | Qué hace en el sistema | Frecuencia | Necesidad central |
|---|---|---|---|
| **Gestor/a comercial** (persona primaria) | Procesa la cola de seguimientos, registra gestiones (envíos/llamadas), avanza empresas por el pipeline | 4-6 h/día, todos los días | Velocidad y certeza: mínimos clicks por empresa, cero dudas de "¿se registró?" |
| **Supervisor/a comercial** | Revisa el pipeline del equipo, reasigna cartera, controla productividad y cuellos de botella | 30-60 min/día | Visión agregada: conversión por etapa, actividad por gestor, drill-down |
| **Admin** | Importa empresas, administra usuarios y permisos | Semanal | Control y auditoría |

Principio rector: **el diseño se optimiza para el gestor comercial** (uso intensivo diario); el supervisor recibe vistas agregadas de los mismos datos; el admin conserva flujos acotados.

---

## 3. Flujo de uso — el día del gestor comercial

```
09:00  Inicia sesión
       └─► HOME GESTOR: "Tu día" → Seguimientos (12) · Sin clasificar (8) ·
           Sin asignar (5) · Gestiones de ayer
09:05  Abre COLA DE SEGUIMIENTOS (1 clic o ⌘K → "cola")
       └─► Recorre empresas con j/k · Enter abre · e = registrar envío
       └─► Cada gestión → toast ✓ "Envío registrado — Deshacer"
10:30  Un prospecto responde el mail
       └─► ⌘K → tipea razón social → Enter a Detalle de empresa
       └─► Registra la gestión (respuesta recibida) → avanza etapa
           (DATOS → INTERESADO) → la cola se recalcula
12:00  Revisa PIPELINE (kanban)
       └─► Ve cuello de botella en CONTACTADO (9 empresas quietas)
       └─► Abre una, decide: avanzar / mandar a DESCANSO / RECHAZAR con motivo
14:00  Llega importación nueva del admin
       └─► EMPRESAS → filtro "sin clasificar" → bulk: clasifica 40 como
           Prospecto → asigna 25 a gestores con el selector real
15:00  Un cliente pide que no lo molesten un tiempo
       └─► Detalle → mandar a DESCANSO hasta el 15/10 (etapa ya existente)
17:30  Cierra el día: HOME muestra "gestiones de hoy: 14 · quedan 5 en cola"
```

Flujo del supervisor (paralelo): Home supervisor → KPIs con drill-down (embudo por etapa, actividad por gestor, empresas estancadas) → reasigna en lote desde Cartera → revisa timeline de una empresa conflictiva.

---

## 4. Mapa de navegación propuesto

```
/                        Home por rol (gestor / supervisor)
├── Cobranza             (módulo legado, fuera de alcance)
├── CRM ──────────────── sub-nav persistente (tabs) en todo /crm/**
│   ├── Resumen          /crm            (hoy: lista de empresas → pasa a ser home del CRM)
│   ├── Empresas         /crm/empresas   (lista densa) · /crm/empresas/nueva · /crm/empresas/[id]
│   ├── Pipeline         /crm/pipeline   (kanban por etapa — NUEVO, pantalla corazón)
│   ├── Cola             /crm/cola       (badge dinámico con conteo)
│   ├── Cartera          /crm/cartera    (portafolio por gestor)
│   └── Productividad    /crm/productividad
├── Consolidados · Valoraciones · Plantillas · Mi firma · Usuarios   (sin cambios)
├── Asistencia · Generador PDFs         (⚠ hoy invisibles: enlazar por fin)
└── ⌘K                  Command palette global (overlay, en cualquier pantalla)
```

Cambios de estructura:
1. **`/crm` deja de ser la lista de empresas** y pasa a ser el Resumen del CRM (home por rol). La lista se muda a `/crm/empresas`. Redirect temporal desde `/crm` → `/crm/empresas` para bookmarks.
2. **Sub-nav CRM persistente** (tab bar dentro del layout `/crm`) con badge de conteo en "Cola".
3. **Sidebar activo por prefijo** (bug actual: en `/crm/cartera` el ítem "CRM" no queda activo).
4. Se enlazan `/asistencia` y `/generador-pdfs` en el sidebar (hoy solo accesibles por URL memorizada).

---

## 5. Pantallas (blueprints)

Convención de wireframes: `[botón]`, `▸ tab`, `(estado)`, `→` resultado de acción.

### Z1 — Home por rol (`/` y `/crm` Resumen)

**Propósito**: responder la pregunta de arranque de cada rol sin navegar. El gestor ve SU trabajo; el supervisor ve SU equipo.

```
Gestor comercial                          Supervisor
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ [Buscar empresa o acción… ⌘K]        │   │ [Buscar… ⌘K]                        │
│ Buen día, Ana · mar 26 sep           │   │ Resumen del equipo · sep 2026       │
│ ┌─────────┐┌─────────┐┌─────────┐    │   │ ┌────────┐┌────────┐┌────────┐      │
│ │Tu cola  ││Sin      ││Gestiones│    │   │ │Empresas││Conver- ││Activid.│      │
│ │ 12  →   ││clasif. 8││de ayer 2│    │   │ │activas ││sión 34%││equipo  │      │
│ └─────────┘└─────────┘└─────────┘    │   │ │  214   ││  ▲ +4%  ││  ▓▓▓░  │      │
│ Tu semana (timeline de tu actividad) │   │ └────────┘└────────┘└────────┘      │
│ · Envío a Clínica Norte · 10:32 ✓    │   │ Embudo: REGIST(40) CLASIF(32)       │
│ · Respuesta de Andes SA · 09:14 ✓    │   │ CONTACT(9)⚠ … ENTREGADA(12)         │
│ (empty state enseña: "Importá tu     │   │ (cada KPI → drill-down a la vista   │
│  primera planilla → [Guía]")         │   │  filtrada correspondiente)          │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
```

- Estados: carga (skeleton de cards), vacío con próximo paso (onboarding saltable).
- Datos: conteos ya derivables (cola on-request, eventos auditados existentes, `ConteoActividadUsuario`).

### Z2 — Empresas (`/crm/empresas`)

**Propósito**: encontrar y gestionar empresas; base de operaciones del admin (importación y clasificación masiva).

```
┌────────────────────────────────────────────────────────────┐
│ Empresas                    [Importar] [＋ Nueva empresa]  │
│ [Buscar razón social… ⏎] Tipo:[Todos ▾] Etapa:[Todas ▾]   │
│     Responsable:[Todos ▾] · vista: [compacta ▾]           │
│ ☐ ── 36 filas/pág · orden: [Actividad reciente ▾] ─────── │
│ ☐ Razón social      RUC    Tipo      Etapa     Últ.gestión│
│ ☑ Andes SA          30…   Cliente   ENTREGADA  hace 2 d ✓ │
│ ☑ Clínica Norte     20…   Prospecto DATOS      hace 14 d ⚠│
│ ☐ …                                                        │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 2 seleccionadas → [Asignar gestor…] [Clasificar…]     │  │
│ │ [Cambiar etapa…]                    (action bar)       │  │
│ └──────────────────────────────────────────────────────┘  │
│ ‹ 1 2 3 … 9 ›                        (paginación server)  │
└────────────────────────────────────────────────────────────┘
```

- **Filtros y orden viven en la URL** (`?q=&tipo=&etapa=&responsable=&page=`) → compartibles, sobreviven back/refresh. Prerrequisito de vistas guardadas.
- **Paginación server-side** (`TOP/OFFSET` — hoy trae TODOS los ids).
- Columna **"Última gestión"** derivada de `fechaUltimoEnvio` (dato ya persistido) con badge ámbar por abandono — la métrica de salud de la relación.
- **Asignar gestor = selector de usuarios reales** (reemplaza el input de texto libre actual, donde un typo asigna a un usuario inexistente).
- Empty state: "No hay empresas todavía → [Importar planilla]".

### Z3 — Detalle de empresa (`/crm/empresas/[id]`)

```
┌────────────────────────────────────────────────────────────┐
│ ← Empresas   ANDRES SA · Prospecto · RUC 307…  [Editar]    │
│ Gestor: Ana · Etapa: DATOS · Próxima acción: 2° envío · ⏱  │
│ ▸ Resumen   ▸ Contactos   ▸ Pipeline   ▸ Timeline          │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ (Resumen)   Datos de la empresa · tipo · convenio     │ │
│ │ (Contactos) Personas con mail/teléfono/rol            │ │
│ │ (Pipeline)  Etapa actual + transiciones disponibles   │ │
│ │             con confirmación y auditoría (T-codes)    │ │
│ │ (Timeline)  Historial auditado: envíos, cambios de    │ │
│ │             etapa, notas — ya existe, enriquecer      │ │
│ └────────────────────────────────────────────────────────┘ │
│ Acciones rápidas: [＋ Registrar gestión] [Avanzar etapa]    │
└────────────────────────────────────────────────────────────┘
```

- Header con identidad clara + **próxima acción siempre visible**.
- Acciones contextuales siempre accesibles (no enterradas en el timeline).

### Z4 — Cola de seguimientos (`/crm/cola`)

**Propósito**: EL flujo de procesamiento en serie del sistema — una pantalla, cero distracciones.

```
┌────────────────────────────────────────────────────────────┐
│ Tu cola de hoy · 12 pendientes        [j/k] navegar · ?    │
│ ┌ Vencidas hoy (3) ──────────────────────────────────────┐ │
│ │ ▸ Andes SA      · 2° envío   · última: hace 6 d        │ │
│ │    [Registrar envío ✓e]  [Abrir ⏎]                      │ │
│ │ ▸ Clínica Norte · 1° envío   · última: hace 14 d ⚠      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌ Reinicios (2) ┐ ┌ Decisión (4) ┐ ┌ Reactivables (3) ┐    │
│ (empty state: "No quedan seguimientos pendientes hoy.      │
│  Próxima ventana: jueves 10:00 — vas al día ✓")           │
└────────────────────────────────────────────────────────────┘
```

- **Acción inline "Registrar envío" en la fila** (hoy exige navegar al detalle: 4 pasos → 1).
- Keyboard-first: `j/k` mueve, `Enter` abre detalle, `e` registra envío, `?` cheat-sheet.
- Cada gestión → toast "✓ Envío registrado — Deshacer".
- Agrupación por motivo (vencidas / reinicios / decisión / reactivables) como hoy.

### Z5 — Cartera comercial (`/crm/cartera`)

**Propósito**: el portafolio de empresas por gestor — quién tiene qué, en qué etapa está cada relación y qué se está descuidando. (Es la vista de asignación y carga de trabajo, no de dinero.)

```
┌────────────────────────────────────────────────────────────┐
│ Cartera · gestor: [Ana ▾] · ver: [Todas las etapas ▾]      │
│ Resumen: 38 empresas · 12 activas · 9 estancadas 14+ d ⚠   │
│ Distribución: REGISTRADO ▓▓ CLASIFICADO ▓▓▓ CONTACTADO ▓   │
│               DATOS ▓▓▓▓ INTERESADO ▓ ENTREGADA ▓▓▓        │
│ ☐ Empresa        Tipo      Etapa      Próx. acción   Últ.g │
│ ☑ Andes SA       Cliente   ENTREGADA  —             2 d ✓ │
│ ☑ Clínica Norte  Prospecto DATOS      2° envío      14 d ⚠│
│ orden default: estancamiento (días sin gestión × etapa)    │
│ [2 sel → Reasignar gestor…] [Cambiar etapa…]  (action bar) │
└────────────────────────────────────────────────────────────┘
```

- **Salud de la relación** en lugar de aging financiero: días sin gestión, empresas estancadas por etapa, próximas acciones.
- Panel de asignación existente se integra: reasignación en lote desde la action bar.
- La barra de distribución por etapa da el "pulso" del portafolio sin abrir el kanban.

### Z6 — Registrar gestión (diálogo, desde Z3/Z4/Z5)

**Propósito**: capturar toda interacción con una empresa en un solo lugar, con resultado y consecuencia.

```
┌─ Registrar gestión — Andes SA ───────────────────┐
│ Tipo:  (•) Envío mail  ( ) Llamada  ( ) Visita    │
│        ( ) Nota interna                          │
│ Resultado: [Respondió / Sin respuesta / …  ▾]     │
│ Nota: [………………………………………]                        │
│ ¿Avanzar etapa? DATOS → [INTERESADO ▾] (opcional) │
│ Próxima acción: [3° envío en 7 días  ▾]           │
│                    [Cancelar] [Guardar ✓]         │
└──────────────────────────────────────────────────┘
→ Toast ✓ "Gestión registrada — Deshacer"
→ Timeline + cola + pipeline se recalculan
```

- Un diálogo = gestión + transición opcional + recálculo de la cola (hoy son 3 viajes).
- Alimenta la auditoría existente y la productividad.
- Nota: hoy solo existen "envíos"; el diálogo generaliza a llamada/visita/nota como decisión de producto a validar.

### Z7 — Pipeline (`/crm/pipeline`) — NUEVO, pantalla corazón

```
┌─────────────────────────────────────────────────────────┐
│ Flujo: [Inbound ▾] [Outbound ▾]        [+ Empresa]      │
│ REGISTRADO(12) CLASIFICADO(8) CONTACTADO(9)⚠ … ENTREGADA │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ Andes SA │ │ Norte SA │ │ …        │  drag & drop     │
│ │ hace 2 d │ │ hace 14d⚠│ │          │  = transición    │
│ │ ·Ana     │ │ ·Sin asig│ │          │  auditada        │
│ └──────────┘ └──────────┘ └──────────┘                  │
│ ⚠ RECHAZADO (cross-flow): banda inferior especial       │
│ DESCANSO: banda con "vuelve el 15/10"                   │
└─────────────────────────────────────────────────────────┘
```

- Columnas = etapas de la máquina de estados existente (11 etapas, 2 flujos: Inbound/Outbound).
- Conteo por columna + badge de estancamiento = el pulso comercial sin abrir nada.
- Drag & drop dispara la transición YA auditada (T-codes existentes); `@dnd-kit` ya está en el proyecto (lo usa plantillas-editor).
- RECHAZADO y DESCANSO como bandas especiales (no son etapas lineales del flujo).

### Z8 — Importar (`/crm/importar`) — existente, ajustes mínimos

Wizard 3 pasos actual (subir → preview → resultado) se conserva. Se agrega: empty state post-importación que guía el siguiente paso ("Importaste 120 empresas → clasificarlas → asignar gestores").

### Z9 — Productividad (`/crm/productividad`) — existente, ajustes

Tabla por gestor con desglose de eventos. Cambios: **período en la URL**, `overflow-x` + densidad, export Excel existente.

### Z10 — Command palette (⌘K, overlay global)

```
┌─ 🔍 ────────────────────────────────┐
│ andes                               │
│ → Ir a: Andes SA (detalle)          │
│ → Acción: Registrar gestión Andes SA│
│ 🏢 Empresas: Andes SA · Andes Group │
│ ────────────────────────────────    │
│ (vacío: páginas + acciones frecuentes│
│  "Nueva empresa" "Mi cola" "Pipeline")│
└──────────────────────────────────────┘
```

- Tres capas: navegar / buscar empresas por razón social / acciones contextuales.
- Isla `'use client'` única (compatible con Server Components), librería `cmdk`.

---

## 6. Principios transversales de diseño

1. **Tokens semánticos** (Tailwind 4 `@theme`): primary `#0284C7` sky clínico, accent verde salud, `muted-foreground` slate (arregla los 15 archivos con el token roto), `card`, `border`, `destructive` rojo. Base: paleta "Patient Portal / Health Records" de la skill.
2. **Badges de estado accesibles**: icono + texto + color, siempre. Vocabulario cerrado por dominio (etapa / tipo / resultado de gestión).
3. **Densidad operativa**: fila de tabla 36px, padding 8-12px en vistas de operación, headers sticky, toggle compacto/confortable persistido (`localStorage`).
4. **Feedback universal**: toda acción → toast (3-5s) con "Deshacer" cuando la auditoría lo permite; destructivos (RECHAZAR, DESCANSO) → confirmación **con motivo**.
5. **Filtros en la URL** en toda lista (empresas, cartera, cola, productividad) — compartible, sobrevive refresh, base de vistas guardadas.
6. **Empty states que enseñan**: cada vacío muestra el próximo paso con botón.
7. **Modales que respetan el trabajo**: Escape, focus trap, overlay NO descarta lo tipeado (bug actual).
8. **Desktop-first**; mobile = consulta (cards, KPIs), no gestión masiva.
9. **Próxima acción siempre visible**: en detalle, en filas, en kanban — el sistema siempre dice qué sigue.
10. **Accesibilidad**: focus visible 3px, contraste 4.5:1, `reduced-motion`, navegación por teclado en listas.

---

## 7. Implicancia sobre la dirección de implementación

El flujo diseñado requiere las tres capas:

| Capa | Dirección | Por qué el flujo la exige |
|---|---|---|
| Base visual | Operación densa | Tokens, kit UI, densidad, toasts, bulk — toda pantalla los usa |
| Navegación | Productividad power-user | ⌘K, home por rol, cola keyboard-first, filtros URL |
| Dominio comercial | Pipeline + gestiones end-to-end | Kanban Z7, diálogo de gestión Z6, cartera comercial Z5, score de estancamiento |

Faltan 2 decisiones de producto antes del plan final:
1. **Alcance del modelo de gestión**: ¿el diálogo Z6 generaliza el "envío" existente a llamada/visita/nota (modelo de gestiones), o se mantiene solo mail y el diálogo se limita a envío + transición?
2. **Alcance del primer entregable**: ¿quick wins de fricción primero (impacto inmediato en el gestor), o se arranca directo por el pipeline kanban + cola inline?

---

*Documento v2 (reencuadrado a CRM comercial de contacto a clientes y prospectos) — revisar y ajustar antes de derivar el plan de implementación.*
