import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type {
  IngestaConocimientoVista,
  UseIngestasConocimientoResult,
} from '@/features/crm/presentation/hooks/useIngestasConocimiento';

/**
 * UI contract for /admin/crm/conocimiento (agente-ia-crm E4·T8 — the
 * MÍNIMA knowledge-upload view; the full editor lands in E6). Pinned:
 * - the server shell: h1 + the etapa-6 caption;
 * - TWO cards ('Pegar texto' / 'Subir archivo') with optional vigencia
 *   date inputs and a Cargar button each;
 * - 'Ingestas recientes' with nombre, tipo, estado badge (COMPLETADA
 *   shows the created-entries count, FALLIDA the truncated error) and
 *   formatted creadoEn;
 * - 'cargar texto' reaches the hook with the form values and the
 *   inline 'Ingesta creada — procesando…' message on success;
 * - inline errors: hook errorSubida and list status error both surface.
 * The hook is mocked at the module boundary (the hook has its OWN
 * contract suite).
 */

const mocks = vi.hoisted(() => ({
  useIngestasConocimientoMock: vi.fn(),
}));

vi.mock('@/features/crm/presentation/hooks/useIngestasConocimiento', () => ({
  useIngestasConocimiento: mocks.useIngestasConocimientoMock,
}));

import ConocimientoPage from '../page';

const COMPLETADA: IngestaConocimientoVista = {
  id: 7,
  nombre: 'Manual comercial.pdf',
  tipo: 'PDF',
  tamanoBytes: 42,
  estado: 'COMPLETADA',
  error: null,
  entradasCreadas: 3,
  creadoPor: 'Marcos Conversa',
  creadoEn: '2026-10-12T10:00:00.000Z',
  procesadoEn: '2026-10-12T10:00:05.000Z',
  vigenciaDesde: null,
  vigenciaHasta: null,
};

const PENDIENTE: IngestaConocimientoVista = {
  ...COMPLETADA,
  id: 8,
  nombre: 'Notas.txt',
  tipo: 'TXT',
  estado: 'PENDIENTE',
  entradasCreadas: 0,
  procesadoEn: null,
};

function estadoHook(sobre: Partial<UseIngestasConocimientoResult> = {}): UseIngestasConocimientoResult {
  return {
    ingestas: [],
    status: 'populated',
    error: null,
    refetch: vi.fn(),
    cargarTexto: vi.fn().mockResolvedValue(null),
    cargarArchivo: vi.fn().mockResolvedValue(null),
    subiendo: false,
    errorSubida: null,
    limpiarErrorSubida: vi.fn(),
    ...sobre,
  };
}

const cargarTextoMock = vi.fn();

beforeEach(() => {
  cargarTextoMock.mockReset();
  cargarTextoMock.mockResolvedValue(null);
  mocks.useIngestasConocimientoMock.mockReset();
  mocks.useIngestasConocimientoMock.mockReturnValue(estadoHook());
});

describe('ConocimientoPage (shell + panel)', () => {
  it('renderiza encabezado, caption de la etapa 6, ambas tarjetas y la sección de recientes', () => {
    render(<ConocimientoPage />);

    expect(screen.getByRole('heading', { name: 'Conocimiento del agente', level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText(/Todo lo subido entra al conocimiento que La Guía usa de inmediato\. El editor completo llega con la etapa 6\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pegar texto' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Subir archivo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ingestas recientes' })).toBeInTheDocument();
  });

  it('lista las ingestas con nombre, tipo, badge de estado y fecha formateada', () => {
    mocks.useIngestasConocimientoMock.mockReturnValue(estadoHook({ ingestas: [COMPLETADA, PENDIENTE] }));

    render(<ConocimientoPage />);

    expect(screen.getByText('Manual comercial.pdf')).toBeInTheDocument();
    expect(screen.getByText('Notas.txt')).toBeInTheDocument();
    // COMPLETADA muestra el contador de entradas creadas.
    expect(screen.getByText('COMPLETADA · 3 entradas')).toBeInTheDocument();
    expect(screen.getByText('PENDIENTE')).toBeInTheDocument();
    // creadoEn formateado dd/mm/aaaa hh:mm — una fila por ingesta.
    const fechas = screen.getAllByText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    expect(fechas).toHaveLength(2);
  });

  it('FALLIDA muestra el error truncado, nunca el texto completo', () => {
    const errorLargo = 'x'.repeat(200);
    mocks.useIngestasConocimientoMock.mockReturnValue(
      estadoHook({
        ingestas: [{ ...COMPLETADA, estado: 'FALLIDA', entradasCreadas: 0, error: errorLargo }],
      }),
    );

    render(<ConocimientoPage />);

    const badge = screen.getByText(/^FALLIDA · /);
    expect(badge.textContent).toContain('…');
    expect(badge.textContent!.length).toBeLessThan(120);
    expect(screen.queryByText(errorLargo)).not.toBeInTheDocument();
  });

  it('lista vacía → mensaje de ausencia, no un vacío mudo', () => {
    render(<ConocimientoPage />);

    expect(screen.getByText(/Aún no hay ingestas/)).toBeInTheDocument();
  });
});

describe('ConocimientoPage — tarjeta Pegar texto', () => {
  it('completa el formulario y llama cargarTexto con los datos; muestra el aviso de proceso', async () => {
    const creada: IngestaConocimientoVista = { ...PENDIENTE, id: 9, nombre: 'Políticas 2026', tipo: 'TEXTO' };
    cargarTextoMock.mockResolvedValue(creada);
    mocks.useIngestasConocimientoMock.mockImplementation((...args: unknown[]) => {
      const estado = estadoHook();
      estado.cargarTexto = cargarTextoMock as unknown as UseIngestasConocimientoResult['cargarTexto'];
      void args;
      return estado;
    });

    render(<ConocimientoPage />);

    const tarjeta = screen.getByRole('region', { name: 'Pegar texto' });
    fireEvent.change(withinTarjeta(tarjeta).labelText('Título'), { target: { value: 'Políticas 2026' } });
    fireEvent.change(withinTarjeta(tarjeta).labelText('Contenido'), { target: { value: 'Todo lo que la Guía debe saber' } });
    fireEvent.change(withinTarjeta(tarjeta).labelText('Vigencia desde'), { target: { value: '2026-01-01' } });
    fireEvent.change(withinTarjeta(tarjeta).labelText('Vigencia hasta'), { target: { value: '2026-12-31' } });

    fireEvent.click(withinTarjeta(tarjeta).boton('Cargar'));

    await waitFor(() =>
      expect(cargarTextoMock).toHaveBeenCalledWith({
        nombre: 'Políticas 2026',
        contenido: 'Todo lo que la Guía debe saber',
        vigencia: { desde: '2026-01-01', hasta: '2026-12-31' },
      }),
    );
    expect(await screen.findByText('Ingesta creada — procesando…')).toBeInTheDocument();
  });

  it('con el título vacío no llama al hook (evita un viaje en vano)', () => {
    render(<ConocimientoPage />);

    const tarjeta = screen.getByRole('region', { name: 'Pegar texto' });
    fireEvent.click(withinTarjeta(tarjeta).boton('Cargar'));

    expect(cargarTextoMock).not.toHaveBeenCalled();
  });
});

describe('ConocimientoPage — tarjeta Subir archivo', () => {
  it('selecciona un archivo y llama cargarArchivo con él', async () => {
    const cargarArchivoMock = vi.fn().mockResolvedValue(null);
    mocks.useIngestasConocimientoMock.mockImplementation(() => {
      const estado = estadoHook();
      estado.cargarArchivo = cargarArchivoMock as unknown as UseIngestasConocimientoResult['cargarArchivo'];
      return estado;
    });

    render(<ConocimientoPage />);

    const tarjeta = screen.getByRole('region', { name: 'Subir archivo' });
    const archivo = new File(['contenido'], 'notas.txt', { type: 'text/plain' });
    fireEvent.change(withinTarjeta(tarjeta).labelText('Archivo'), { target: { files: [archivo] } });

    fireEvent.click(withinTarjeta(tarjeta).boton('Cargar'));

    await waitFor(() =>
      expect(cargarArchivoMock).toHaveBeenCalledWith({ file: archivo, vigencia: { desde: '', hasta: '' } }),
    );
  });

  it('acepta solo .pdf/.txt/.docx en el input', () => {
    render(<ConocimientoPage />);

    const tarjeta = screen.getByRole('region', { name: 'Subir archivo' });
    const input = withinTarjeta(tarjeta).labelText('Archivo') as HTMLInputElement;
    expect(input.accept).toBe('.pdf,.txt,.docx');
  });
});

describe('ConocimientoPage — errores', () => {
  it('errorSubida del hook se muestra inline junto al formulario', () => {
    mocks.useIngestasConocimientoMock.mockReturnValue(
      estadoHook({ errorSubida: 'Ingesta inválida (nombre): el nombre es obligatorio' }),
    );

    render(<ConocimientoPage />);

    expect(screen.getByText(/el nombre es obligatorio/)).toBeInTheDocument();
  });

  it('status error de la lista muestra el mensaje de fallo', () => {
    mocks.useIngestasConocimientoMock.mockReturnValue(
      estadoHook({ status: 'error', error: 'No se pudieron cargar las ingestas (HTTP 500)' }),
    );

    render(<ConocimientoPage />);

    expect(screen.getByText(/No se pudieron cargar las ingestas/)).toBeInTheDocument();
  });
});

/** Helpers de alcance: los labels y botones se buscan DENTRO de cada tarjeta. */
function withinTarjeta(tarjeta: HTMLElement): {
  labelText: (label: string) => HTMLElement;
  boton: (nombre: string) => HTMLElement;
} {
  return {
    labelText(label: string): HTMLElement {
      const input = tarjeta.querySelector<HTMLElement>(`[aria-label="${label}"]`);
      if (!input) throw new Error(`input no encontrado: ${label}`);
      return input;
    },
    boton(nombre: string): HTMLElement {
      const botones = Array.from(tarjeta.querySelectorAll('button'));
      const boton = botones.find((b) => b.textContent?.includes(nombre));
      if (!boton) throw new Error(`botón no encontrado: ${nombre}`);
      return boton;
    },
  };
}
