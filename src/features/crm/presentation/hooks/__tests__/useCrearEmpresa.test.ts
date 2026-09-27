import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import {
  MENSAJE_RUC_DUPLICADO,
  RUTA_API_EMPRESAS,
  buildAltaEmpresaInput,
  buildCrearEmpresaInput,
  mapearErrorCreacion,
  mapearTipoRegistro,
  partirCorreosFormulario,
  useCrearEmpresa,
  type CamposAltaEmpresa,
  type FormularioEmpresaState,
} from '../useCrearEmpresa';
import type { Empresa } from '../../../domain/entities';

// ---- Fixtures ----

function makeEmpresa(sobreNombre: Partial<Empresa> = {}): Empresa {
  return {
    id: 7,
    ruc: '900123456',
    rucNormalizado: '900123456',
    razonSocial: 'Constructora X',
    tipo: 'Prospecto',
    origen: 'Inbound',
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [
      {
        id: 71,
        empresaId: 7,
        nombre: 'Ana',
        telefono: null,
        esPrincipal: true,
        correos: [],
      },
    ],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...sobreNombre,
  };
}

const ESTADO_BASE: FormularioEmpresaState = {
  razonSocial: '  Constructora X  ',
  ruc: ' 900-123456 ',
  tipo: 'Prospecto',
  origen: 'Inbound',
  proyectoObra: '  Obra Central  ',
  destinoComun: '  Lima  ',
  notas: '  Viene por cotización  ',
  encargado: '  Ana  ',
  correos: ' ANA@X.com; luis@x.com; ANA@X.com ;;  ',
  telefono: ' 999 888 777 ',
  principal: true,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- Pure helpers ----

describe('partirCorreosFormulario', () => {
  it('splits on ";", normalizes, drops empties and dedupes preserving first-seen order', () => {
    expect(partirCorreosFormulario(' ANA@X.com; luis@x.com; ANA@X.com ;;  ')).toEqual([
      'ana@x.com',
      'luis@x.com',
    ]);
  });

  it('returns an empty list for a blank field', () => {
    expect(partirCorreosFormulario('   ')).toEqual([]);
  });
});

describe('buildCrearEmpresaInput', () => {
  it('trims fields, normalizes the correos and maps blanks to null (single principal contacto)', () => {
    expect(buildCrearEmpresaInput(ESTADO_BASE)).toEqual({
      ruc: '900-123456',
      razonSocial: 'Constructora X',
      tipo: 'Prospecto',
      origen: 'Inbound',
      proyectoObra: 'Obra Central',
      destinoComun: 'Lima',
      notas: 'Viene por cotización',
      responsable: null,
      contactos: [
        {
          nombre: 'Ana',
          telefono: '999 888 777',
          esPrincipal: true,
          correos: ['ana@x.com', 'luis@x.com'],
        },
      ],
    });
  });

  it('maps the empty origen and blank optionals to null', () => {
    const input = buildCrearEmpresaInput({
      ...ESTADO_BASE,
      origen: '',
      proyectoObra: '   ',
      destinoComun: '',
      notas: '',
      telefono: '',
      principal: false,
    });

    expect(input.origen).toBeNull();
    expect(input.proyectoObra).toBeNull();
    expect(input.destinoComun).toBeNull();
    expect(input.notas).toBeNull();
    expect(input.contactos[0]?.telefono).toBeNull();
    expect(input.contactos[0]?.esPrincipal).toBe(false);
  });

  it('throws the Spanish invariant when tipo was never chosen (validation guards first)', () => {
    expect(() => buildCrearEmpresaInput({ ...ESTADO_BASE, tipo: '' })).toThrow(
      'Selecciona el tipo de empresa.',
    );
  });
});

describe('mapearErrorCreacion', () => {
  it('maps the typed CONFLICT_ERROR (409 RUC duplicado) to the friendly message', () => {
    expect(
      mapearErrorCreacion(
        { success: false, error: 'Ya existe una empresa con el RUC 900123456', code: 'CONFLICT_ERROR' },
        409,
      ),
    ).toBe(MENSAJE_RUC_DUPLICADO);
  });

  it('surfaces other typed API errors verbatim (Spanish per repo convention)', () => {
    expect(
      mapearErrorCreacion(
        { success: false, error: 'Esta acción requiere el permiso crm_admin', code: 'FORBIDDEN' },
        403,
      ),
    ).toBe('Esta acción requiere el permiso crm_admin');
  });

  it('falls back to the HTTP status when the body has no usable error', () => {
    expect(mapearErrorCreacion({}, 500)).toBe('HTTP 500');
  });
});

// ---- Alta del panel (task 10.2, rediseno-crm-panel) ----

describe('mapearTipoRegistro', () => {
  it('maps "Cliente Nuevo" to the Cliente/Inbound door (already asked for a quote)', () => {
    expect(mapearTipoRegistro('Cliente Nuevo')).toEqual({ tipo: 'Cliente', origen: 'Inbound' });
  });

  it('maps "Posible Cliente" to the Prospecto/Outbound door (we contact them)', () => {
    expect(mapearTipoRegistro('Posible Cliente')).toEqual({ tipo: 'Prospecto', origen: 'Outbound' });
  });
});

describe('buildAltaEmpresaInput', () => {
  const CAMPOS_BASE: CamposAltaEmpresa = {
    tipoRegistro: 'Cliente Nuevo',
    razonSocial: '  Constructora Los Andes  ',
    ruc: ' 20489561234 ',
    contacto: '  Carlos Mendoza  ',
    cargo: 'Recursos Humanos / Seguridad',
    correo: ' CARLOS@Andes.com ',
    telefono: ' 987 654 321 ',
    sector: 'Construcción',
    cantidadTrabajadores: 30,
  };

  it('builds the single-principal contacto with the radio-mapped tipo+origen, trimmed fields and a normalized correo', () => {
    expect(buildAltaEmpresaInput(CAMPOS_BASE)).toEqual({
      ruc: '20489561234',
      razonSocial: 'Constructora Los Andes',
      tipo: 'Cliente',
      origen: 'Inbound',
      sector: 'Construcción',
      cantidadTrabajadores: 30,
      contactos: [
        {
          nombre: 'Carlos Mendoza',
          cargo: 'Recursos Humanos / Seguridad',
          telefono: '987 654 321',
          esPrincipal: true,
          correos: ['carlos@andes.com'],
        },
      ],
    });
  });

  it('maps blank cargo/telefono to null and the other radio door through the same builder', () => {
    const input = buildAltaEmpresaInput({
      ...CAMPOS_BASE,
      tipoRegistro: 'Posible Cliente',
      cargo: '   ',
      telefono: '',
      cantidadTrabajadores: null,
    });

    expect(input.tipo).toBe('Prospecto');
    expect(input.origen).toBe('Outbound');
    expect(input.cantidadTrabajadores).toBeNull();
    expect(input.contactos[0]?.cargo).toBeNull();
    expect(input.contactos[0]?.telefono).toBeNull();
  });

  it('throws the Spanish invariant when the contacto correo is blank (the form guards it first)', () => {
    expect(() => buildAltaEmpresaInput({ ...CAMPOS_BASE, correo: '   ' })).toThrow(
      'Ingresa el correo electrónico del contacto.',
    );
  });
});

describe('useCrearEmpresa — crearEnPanel (persist-first + carta opcional)', () => {
  const INPUT = buildCrearEmpresaInput(ESTADO_BASE);

  function mockDosRutas(
    respuestaPersistir: () => Response,
    respuestaEnvios: () => Response | Promise<Response>,
  ): void {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === RUTA_API_EMPRESAS) return Promise.resolve(respuestaPersistir());
      return Promise.resolve(respuestaEnvios());
    });
  }

  it('persists FIRST, then POSTs the carta to the shared envios path (same seam as the row button)', async () => {
    const empresa = makeEmpresa();
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({ url: String(input), init: init ?? {} });
      if (String(input) === RUTA_API_EMPRESAS) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, empresa }), { status: 201 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 201 }));
    });

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crearEnPanel>> | undefined;

    await act(async () => {
      resultado = await result.current.crearEnPanel(INPUT, { enviarCarta: true });
    });

    expect(resultado).toEqual({ ok: true, empresa, advertenciaCarta: null });
    expect(llamadas.map((l) => l.url)).toEqual([
      RUTA_API_EMPRESAS,
      `/api/crm/empresas/${empresa.id}/envios`,
    ]);
    expect(JSON.parse(String(llamadas[1]?.init.body))).toEqual({
      plantilla: 'carta_presentacion',
    });
    expect(result.current.enCurso).toBe(false);
  });

  it('skips the envios call entirely when the carta checkbox is OFF', async () => {
    const empresa = makeEmpresa();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === RUTA_API_EMPRESAS) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, empresa }), { status: 201 }),
        );
      }
      return Promise.reject(new Error('no debe llamarse'));
    });

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crearEnPanel>> | undefined;

    await act(async () => {
      resultado = await result.current.crearEnPanel(INPUT, { enviarCarta: false });
    });

    expect(resultado).toEqual({ ok: true, empresa, advertenciaCarta: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the empresa (ok) and surfaces the SMTP error verbatim as advertenciaCarta', async () => {
    mockDosRutas(
      () =>
        new Response(JSON.stringify({ success: true, empresa: makeEmpresa() }), { status: 201 }),
      () =>
        new Response(
          JSON.stringify({ success: false, error: 'Error de envío: SMTP_AUTH_ERROR' }),
          { status: 502 },
        ),
    );

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crearEnPanel>> | undefined;

    await act(async () => {
      resultado = await result.current.crearEnPanel(INPUT, { enviarCarta: true });
    });

    expect(resultado).toEqual({
      ok: true,
      empresa: makeEmpresa(),
      advertenciaCarta: 'Error de envío: SMTP_AUTH_ERROR',
    });
  });

  it('returns the persist error and never attempts the carta when the alta fails', async () => {
    mockDosRutas(
      () =>
        new Response(
          JSON.stringify({ success: false, error: 'RUC', code: 'CONFLICT_ERROR' }),
          { status: 409 },
        ),
      () => Promise.reject(new Error('no debe llamarse')),
    );

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crearEnPanel>> | undefined;

    await act(async () => {
      resultado = await result.current.crearEnPanel(INPUT, { enviarCarta: true });
    });

    expect(resultado).toEqual({ ok: false, empresa: null, error: MENSAJE_RUC_DUPLICADO });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('holds enCurso across BOTH steps (persist + carta), releasing only at the end', async () => {
    mockDosRutas(
      () => new Response(JSON.stringify({ success: true, empresa: makeEmpresa() }), { status: 201 }),
      () => new Response(JSON.stringify({ success: true }), { status: 201 }),
    );

    const { result } = renderHook(() => useCrearEmpresa());

    let pendiente: Promise<Awaited<ReturnType<typeof result.current.crearEnPanel>>>;
    act(() => {
      pendiente = result.current.crearEnPanel(INPUT, { enviarCarta: true });
    });
    await waitFor(() => expect(result.current.enCurso).toBe(true));

    await act(async () => {
      await pendiente;
    });
    expect(result.current.enCurso).toBe(false);
  });
});

// ---- Hook ----

describe('useCrearEmpresa', () => {
  it('POSTs the input to /api/crm/empresas and resolves ok with the created empresa on 201', async () => {
    const empresa = makeEmpresa();
    const input = buildCrearEmpresaInput(ESTADO_BASE);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, empresa }), { status: 201 }),
    );

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crear>> | undefined;

    await act(async () => {
      resultado = await result.current.crear(input);
    });

    expect(resultado).toEqual({ ok: true, empresa });
    expect(fetchMock).toHaveBeenCalledWith(RUTA_API_EMPRESAS, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(result.current.enCurso).toBe(false);
  });

  it('reports the friendly RUC duplicado message on 409 CONFLICT_ERROR', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Ya existe una empresa con el RUC 900123456',
          code: 'CONFLICT_ERROR',
        }),
        { status: 409 },
      ),
    );

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crear>> | undefined;

    await act(async () => {
      resultado = await result.current.crear(buildCrearEmpresaInput(ESTADO_BASE));
    });

    expect(resultado).toEqual({ ok: false, empresa: null, error: MENSAJE_RUC_DUPLICADO });
  });

  it('surfaces other API errors verbatim without throwing', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: 'Esta acción requiere el permiso crm_admin', code: 'FORBIDDEN' }),
        { status: 403 },
      ),
    );

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crear>> | undefined;

    await act(async () => {
      resultado = await result.current.crear(buildCrearEmpresaInput(ESTADO_BASE));
    });

    expect(resultado).toEqual({ ok: false, empresa: null, error: 'Esta acción requiere el permiso crm_admin' });
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('Error de red'));

    const { result } = renderHook(() => useCrearEmpresa());
    let resultado: Awaited<ReturnType<typeof result.current.crear>> | undefined;

    await act(async () => {
      resultado = await result.current.crear(buildCrearEmpresaInput(ESTADO_BASE));
    });

    expect(resultado).toEqual({ ok: false, empresa: null, error: 'Error de red' });
  });

  it('toggles enCurso while the request is in flight', async () => {
    let resolverFetch: ((r: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolverFetch = resolve;
        }),
    );

    const { result } = renderHook(() => useCrearEmpresa());

    let pendiente: Promise<Awaited<ReturnType<typeof result.current.crear>>>;
    act(() => {
      pendiente = result.current.crear(buildCrearEmpresaInput(ESTADO_BASE));
    });
    await waitFor(() => expect(result.current.enCurso).toBe(true));

    await act(async () => {
      resolverFetch?.(
        new Response(JSON.stringify({ success: true, empresa: makeEmpresa() }), { status: 201 }),
      );
      await pendiente;
    });
    expect(result.current.enCurso).toBe(false);
  });
});
