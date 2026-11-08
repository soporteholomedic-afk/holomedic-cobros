# Feature: manual-crm-pdf — Manual de usuario del CRM (PDF con capturas anotadas)

> Rama: `develop` (trabajo en `temp/manual-crm/`, sin commits salvo que el usuario pida) · Creado: 2026-11-04
> Skills reutilizables creadas: `~/.agents/skills/app-manual-pdf/` y `~/.agents/skills/brand-colors-extract/` (validadas con smoke test).
> GUIA DEL PIPELINE: leer `~/.agents/skills/app-manual-pdf/SKILL.md` antes de continuar tras una compactación.

## Specs
- S1: «Crea un documento PDF que indique como usar el CRM» — PDF final que explica el uso del CRM.
- S2: «quiero que utilices imagenes y que en cada una de ellas muestre flechas y cuadros para mostrar partes de interes» — toda imagen lleva recuadros y flechas con puntos numerados.
- S3: «debe cubrir todo los aspectos» — cobertura completa: login, navegación, tablero kanban (5 etapas), alta de empresa, entrantes, registrar contacto, detalle/historial, mover tarjetas (medio/motivo), sugerencia Perdido, próxima acción, importar Excel.
- S4: «debe estar diseñado con los colores institucionales de https://holomedic.com.pe» — paleta extraída del logo (sitio inaccesible): primario `#145383`, acento `#1e81bf`, superficies neutras.
- S5: «pensado para personas que no saben absolutamente nada del programa, por lo que debes usar un lenguaje muy sencillo» — frases cortas, sin jerga, sin nombres de ruta; cada imagen con pasos numerados debajo.
- S6: «Crea Skills para que reutilizarlos en un futuro para casos similares» — hecho (skills globales).
- S7 (L2): «seria mejor si creas las skills y luego haces el trabajo, para que la instruccion sobreviva a autocompact» — orden: skills primero (cumplido), luego el trabajo guiándose por ellas.

## Tareas
| ID | Specs | Ruta | Estado |
|----|-------|------|--------|
| T1 | S6, S7 | `~/.agents/skills/{app-manual-pdf,brand-colors-extract}/` | HECHA (smoke test OK) |
| T2 | S1-S5 | capturas con sesión → `temp/manual-crm/img/` | HECHA (10 pantallas + 2 variantes; datos demo creados vía API) |
| T3 | S2 | anotar cada captura (anotar.mjs) | HECHA (11 imágenes + leyendas JSON; modo leyenda html agregado al asset) |
| T4 | S4, S5 | `temp/manual-crm/manual.html` → `manual.pdf` (render-pdf.mjs) | HECHA (worker: 12 secciones, 15 páginas, 4.2 MB) |
| T5 | S1, S3 | verificación (tamaño, páginas, imágenes, cobertura S3) + informe | HECHA (pdf-parse 15 págs; portada y sección central revisadas visualmente; sin rutas técnicas) |

## Log
- L1 (usuario, verbatim): «Crea un documento PDF que indiqye como usar el CRM. quiero que utilices imagenesy que en cada una de elas muestre flechas y cuadro para mostrar pastes de interes. debe cubir todo los aspectos. Este documento debe estar diseñado con los colores institucionales de https://holomedic.com.pe. ademas qie debe estar pensado para personas que no saben absolutamente nada del peograma, por lo qie debes usar unnlenguaje muy semcillo, para que puedan utilizarlo. Crea Skills para que reutilizarlos en un futuro para casos similares»
- L2 (usuario): «seria mejor si creas las skills y luego haces el trabajo, para que la instruccion sobreviva a autocompact» → se crearon las skills primero y el doc + memoria ANTES de las capturas.
- L3 (hallazgos): CRM real = 2 páginas `/crm` (kanban 5 etapas: Por contactar/Contactado/En seguimiento/Cliente/Perdido) y `/crm/importar`; paneles reales: Nueva empresa, Entrantes («Nos contactaron»), Registrar contacto (medio, resultado, próxima acción), Detalle (contactos, historial, RUC), MedioDialog (al pasar a Contactado), MotivoDialog (al pasar a Perdido), sugerencia «Pasar a Perdido» tras 3 intentos sin respuesta. Sitio holomedic.com.pe inaccesible (IP interna 172.16.10.10 + SSL); paleta desde `public/logo-holomedic.png`: `#145383` (12.3%), `#1e81bf` (3.9%).
- L4 (2026-11-04): sesión real de capturas con usuario `soporte` (credencial provista por el usuario). Se crearon 3 empresas demo aditivas vía la API propia del app (marcadas «(DEMO)») para que el tablero muestre varias etapas; nada destructivo.
- L5 (2026-11-04): anotación con modo `leyenda: html` (recuadros+insignias+flechas en el PNG, textos numerados bajo la figura en el HTML) porque la leyenda embebida tapaba la UI inferior en 7 de 11 capturas.
- L6 (2026-11-04): worker construyó manual.html/manual.pdf (12 secciones, 15 págs). Verificación padre: %PDF-1.4, 4 200 158 bytes, portada y sección central revisadas visualmente, sin rutas técnicas en el texto. Entregable final: `temp/manual-crm/manual.pdf`. Sin cambios de código fuente → sin candidato de revisión nativa (RDD): el PDF es documentación pasiva en temp/ (gitignored).

## Riesgo
Risk: none — no cambia código de la app; solo artefactos nuevos (temp/ + skills globales) y documentación.
