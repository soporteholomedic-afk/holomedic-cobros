export const PAGINAS = {
  1: '',
  2: '/pagina2',
  3: '/pagina3',
  4: '/pagina4',
} as const;

export const TOTAL_PAGINAS = Object.keys(PAGINAS).length;

/** Rutas con layout plano (sin shell ni formulario anidado): páginas 1, 2, 3 y 4. */
export const RUTAS_PAGINAS_SIN_SHELL =
  /^\/areas\/musculoesqueletica\/jjc\/[^/]+\/entrevista(\/pagina2)?(\/pagina3)?(\/pagina4)?$/;
