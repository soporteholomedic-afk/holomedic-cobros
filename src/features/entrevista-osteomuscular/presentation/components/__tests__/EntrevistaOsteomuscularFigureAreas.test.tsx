import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AtencionDetalle } from '@/types/jjc';
import { EntrevistaOsteomuscularProvider } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { useEntrevistaContext } from '@/features/entrevista-osteomuscular/presentation/context/EntrevistaOsteomuscularContext';
import { EntrevistaOsteomuscularForm } from '../EntrevistaOsteomuscularForm';
import { EntrevistaOsteomuscularFormPag2 } from '../EntrevistaOsteomuscularFormPag2';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const ATENCION: AtencionDetalle = {
  idAtencion: 'AT-1001',
  dni: '11223344',
  paciente: 'Paciente Prueba',
  sexo: 'M',
  fechaNac: '01/01/1990',
  edad: 36,
  fechaAtencion: '01/08/2026',
  empresa: 'Empresa X',
  tipoExamen: 'PERIODICO',
  puesto: 'Operario',
  area: 'Producción',
  rutaFirma: null,
  rutaHuella: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: null }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Botón real del provider para disparar el POST de la entrevista completa. */
function SaveHarness() {
  const { save } = useEntrevistaContext();
  return <button onClick={() => void save()}>Guardar entrevista</button>;
}

/** Stub de geometría: jsdom no calcula layout; el handler lee el rect del SVG. */
function stubSvgGeometry(svg: Element, width: number, height: number) {
  const rect = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect);
}

/** Pointer primario en coordenadas absolutas (patrón del repo, ver FaceScanCanvas.test.tsx). */
function pointerDownAt(element: Element, clientX: number, clientY: number) {
  fireEvent.pointerDown(element, { clientX, clientY, isPrimary: true, button: 0 });
}

function postBody(): { idAtencion: string; entrevista: Record<string, unknown> } {
  const postCall = fetchMock.mock.calls.find(
    ([, init]) => init && typeof init === 'object' && (init as RequestInit).method === 'POST',
  );
  if (!postCall) throw new Error('No se encontró una llamada POST');
  return JSON.parse(String((postCall[1] as RequestInit).body));
}

describe('Figuras interactivas — ruteo por página y JSON de guardado', () => {
  it('page 1: los clics sobre la figura de mano/muñeca actualizan su colección y el POST la incluye', async () => {
    const user = userEvent.setup();
    render(
      <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
        <EntrevistaOsteomuscularForm />
        <SaveHarness />
      </EntrevistaOsteomuscularProvider>,
    );

    const mano = screen.getByRole('img', { name: 'Figura de manos y muñecas' });
    stubSvgGeometry(mano, 200, 144);

    pointerDownAt(mano, 100, 72);

    expect(
      screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));

    const { entrevista } = postBody();
    const marcas = (
      entrevista.miembrosSuperiores as {
        manoMuneca: { areaDistribucionAnotaciones: Array<{ id: string; x: number; y: number }> };
      }
    ).manoMuneca.areaDistribucionAnotaciones;
    expect(marcas).toHaveLength(1);
    expect(marcas[0].x).toBeCloseTo(0.5, 2);
    expect(marcas[0].y).toBeCloseTo(0.5, 2);
    expect(marcas[0].id).toBeTruthy();
  });

  it('page 1: remover una marca existente se refleja en el POST', async () => {
    const user = userEvent.setup();
    render(
      <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
        <EntrevistaOsteomuscularForm />
        <SaveHarness />
      </EntrevistaOsteomuscularProvider>,
    );

    const mano = screen.getByRole('img', { name: 'Figura de manos y muñecas' });
    stubSvgGeometry(mano, 200, 144);

    pointerDownAt(mano, 100, 72);
    await user.click(screen.getByRole('button', { name: 'Eliminar marca 1 en Diagrama de manos' }));
    expect(screen.queryByRole('button', { name: /Eliminar marca/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));

    const { entrevista } = postBody();
    const marcas = (
      entrevista.miembrosSuperiores as {
        manoMuneca: { areaDistribucionAnotaciones: unknown[] };
      }
    ).manoMuneca.areaDistribucionAnotaciones;
    expect(marcas).toEqual([]);
  });

  it('page 2: nocturna y diurna actualizan colecciones independientes y el POST las incluye', async () => {
    const user = userEvent.setup();
    render(
      <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
        <EntrevistaOsteomuscularFormPag2 />
        <SaveHarness />
      </EntrevistaOsteomuscularProvider>,
    );

    const nocturna = screen.getByRole('img', { name: 'Figura de manos — parestesia nocturna' });
    const diurna = screen.getByRole('img', { name: 'Figura de torso — parestesia diurna' });
    stubSvgGeometry(nocturna, 128, 96);
    stubSvgGeometry(diurna, 96, 112);

    pointerDownAt(nocturna, 64, 48);
    pointerDownAt(diurna, 50, 60);

    expect(screen.getAllByRole('button', { name: /Eliminar marca/ })).toHaveLength(2);
    expect(nocturna.querySelectorAll('[data-mark-id]')).toHaveLength(1);
    expect(diurna.querySelectorAll('[data-mark-id]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));

    const { entrevista } = postBody();
    const parestesias = entrevista as {
      parestesiaNocturna: { areaDistribucionAnotaciones: Array<{ x: number; y: number }> };
      parestesiaDiurna: { areaDistribucionAnotaciones: Array<{ x: number; y: number }> };
    };
    expect(parestesias.parestesiaNocturna.areaDistribucionAnotaciones).toHaveLength(1);
    expect(parestesias.parestesiaNocturna.areaDistribucionAnotaciones[0].x).toBeCloseTo(0.5, 2);
    expect(parestesias.parestesiaNocturna.areaDistribucionAnotaciones[0].y).toBeCloseTo(0.5, 2);
    expect(parestesias.parestesiaDiurna.areaDistribucionAnotaciones).toHaveLength(1);
    expect(parestesias.parestesiaDiurna.areaDistribucionAnotaciones[0].x).toBeCloseTo(0.52, 2);
    expect(parestesias.parestesiaDiurna.areaDistribucionAnotaciones[0].y).toBeCloseTo(0.54, 2);
  });

  it('page 2: los clics fuera del área dibujable (letterbox) no agregan marcas', async () => {
    const user = userEvent.setup();
    render(
      <EntrevistaOsteomuscularProvider idAtencion={ATENCION.idAtencion} atencion={ATENCION}>
        <EntrevistaOsteomuscularFormPag2 />
        <SaveHarness />
      </EntrevistaOsteomuscularProvider>,
    );

    const nocturna = screen.getByRole('img', { name: 'Figura de manos — parestesia nocturna' });
    stubSvgGeometry(nocturna, 128, 96);

    // Contained rect de 117x81 en caja 128x96: y=3.6923.., h=88.6153..
    pointerDownAt(nocturna, 64, 0);
    pointerDownAt(nocturna, 64, 95);

    expect(screen.queryByRole('button', { name: /Eliminar marca/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar entrevista' }));

    const { entrevista } = postBody();
    const nocturnaMarks = (entrevista as { parestesiaNocturna: { areaDistribucionAnotaciones: unknown[] } })
      .parestesiaNocturna.areaDistribucionAnotaciones;
    expect(nocturnaMarks).toEqual([]);
  });
});
