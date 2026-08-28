import { NextResponse } from 'next/server';

import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';

/**
 * GET /api/valoraciones/lookups/[tipo]
 *
 * One protected lookup endpoint for the filter panel (design D3):
 *  - clientes        → `?q=` (>= 2 chars) by name or RUC → {codCli, nomCom, nroRuc}
 *  - pacientes       → `?q=` (>= 2 chars) by DNI or apellidos/nombres → {codPac, nombre}
 *  - destinos        → `?codCli=` (> 0); without a client → {resultados: []} (spec)
 *  - tipos-trabajador→ no params (runtime constants, hardcoded fallback — D7)
 *  - sedes           → no params (VW_SEDE actives)
 *
 * All queries run through the SIGLA read-only pool with typed binds; the
 * repository escapes LIKE metacharacters (`%_[`). Unknown tipo → 404.
 * Failures → user-safe 500.
 */

const TIPOS_VALIDOS = [
  'clientes',
  'pacientes',
  'destinos',
  'tipos-trabajador',
  'sedes',
] as const;

type TipoLookup = (typeof TIPOS_VALIDOS)[number];

function esTipoValido(tipo: string): tipo is TipoLookup {
  return (TIPOS_VALIDOS as readonly string[]).includes(tipo);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ tipo: string }> },
): Promise<NextResponse> {
  try {
    const { tipo } = await context.params;

    if (!esTipoValido(tipo)) {
      return NextResponse.json(
        { error: `Tipo de lookup desconocido: "${tipo}"` },
        { status: 404 },
      );
    }

    const url = new URL(request.url);

    if (tipo === 'clientes' || tipo === 'pacientes') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length < 2) {
        return NextResponse.json(
          { error: '"q" es obligatorio y debe tener al menos 2 caracteres' },
          { status: 400 },
        );
      }
      const repo = await getValoracionesDb();
      const resultados =
        tipo === 'clientes' ? await repo.buscarClientes(q) : await repo.buscarPacientes(q);
      return NextResponse.json({ resultados });
    }

    if (tipo === 'destinos') {
      // Spec: without a selected client the destino lookup returns empty.
      const codCliRaw = (url.searchParams.get('codCli') ?? '').trim();
      const codCli = Number.parseInt(codCliRaw, 10);
      if (codCliRaw === '' || Number.isNaN(codCli) || codCli <= 0) {
        return NextResponse.json({ resultados: [] });
      }
      const repo = await getValoracionesDb();
      const resultados = await repo.buscarDestinos(codCli);
      return NextResponse.json({ resultados });
    }

    if (tipo === 'tipos-trabajador') {
      const repo = await getValoracionesDb();
      const resultados = await repo.buscarTiposTrabajador();
      return NextResponse.json({ resultados });
    }

    // sedes
    const repo = await getValoracionesDb();
    const resultados = await repo.buscarSedes();
    return NextResponse.json({ resultados });
  } catch (error) {
    // User-safe message — never expose raw DB errors or object names.
    console.error('valoraciones lookups route error:', error);
    return NextResponse.json(
      { error: 'Error al cargar los datos de la búsqueda. Intente nuevamente.' },
      { status: 500 },
    );
  }
}
