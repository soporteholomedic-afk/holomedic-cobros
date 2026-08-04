export const PAGINAS_EVALUACION = {
  1: '',
  2: '/pagina2',
  3: '/pagina3',
  4: '/pagina4',
  5: '/pagina5',
} as const;

export const TOTAL_PAGINAS_EVALUACION = Object.keys(PAGINAS_EVALUACION).length;

/** Rutas con layout plano (sin shell ni formulario anidado): páginas 1 a 5 de evaluación. */
export const RUTAS_SIN_SHELL_EVALUACION =
  /^\/areas\/musculoesqueletica\/jjc\/[^/]+\/evaluacion(\/pagina2)?(\/pagina3)?(\/pagina4)?(\/pagina5)?$/;
