import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MemoriasPanel } from '../MemoriasPanel';
import type { MemoriaLista } from '../../../../domain/entities';

/**
 * Render contract for the right column's memory panel (E3·T5, mockup
 * .side '🧠 Memorias de la gente'): rows `<tipo> contenido` with 📌 on
 * pineadas, per-row pinear/eliminar (eliminar confirms first), the
 * edit flow (inline form → onGuardar with reemplazaObservacionId) and
 * '+ Nueva memoria' (nivel + tipo + titulo + contenido → onGuardar),
 * with empty-state text and client-side validation.
 */

const MEMORIAS: MemoriaLista[] = [
  {
    id: 101,
    nivel: 'empresa',
    tipo: 'acuerdo',
    titulo: 'Cronograma de firmas',
    contenido: 'Pidió propuesta formal para 120 trabajadores',
    pineada: true,
    creadoEn: '2026-06-10T10:00:00.000Z',
  },
  {
    id: 102,
    nivel: 'chat',
    tipo: 'objecion',
    titulo: 'Precio',
    contenido: 'Precio vs. competencia',
    pineada: false,
    creadoEn: '2026-06-11T10:00:00.000Z',
  },
];

const user = userEvent.setup();

function montar(sobres: Partial<Parameters<typeof MemoriasPanel>[0]> = {}): ReturnType<typeof render> {
  const props: Parameters<typeof MemoriasPanel>[0] = {
    memorias: MEMORIAS,
    empresaId: 7,
    status: 'ready',
    error: null,
    gestionando: false,
    errorAccion: null,
    onPinear: () => Promise.resolve(true),
    onEliminar: () => Promise.resolve(true),
    onGuardar: () => Promise.resolve(true),
    ...sobres,
  };
  return render(<MemoriasPanel {...props} />);
}

describe('MemoriasPanel (E3·T5)', () => {
  it('renderiza el título y las filas <tipo> contenido con 📌 en las pineadas', () => {
    montar();

    expect(screen.getByText('🧠 Memorias de la gente')).toBeInTheDocument();
    expect(screen.getByText('📌 acuerdo')).toBeInTheDocument();
    expect(screen.getByText('Pidió propuesta formal para 120 trabajadores')).toBeInTheDocument();
    expect(screen.getByText('objecion')).toBeInTheDocument();
    expect(screen.getByText('Precio vs. competencia')).toBeInTheDocument();
  });

  it('estado vacío → texto explícito', () => {
    montar({ memorias: [] });

    expect(screen.getByText('Sin memorias todavía en esta conversación.')).toBeInTheDocument();
  });

  it('pinear dispara onPinear(observacionId) solo en filas no pineadas', async () => {
    const onPinear = vi.fn().mockResolvedValue(true);
    montar({ onPinear });

    // La fila pineada no ofrece la acción; la no pineada sí.
    const botones = screen.getAllByRole('button', { name: 'Pinear' });
    expect(botones).toHaveLength(1);
    await user.click(botones[0]!);

    expect(onPinear).toHaveBeenCalledWith(102);
  });

  it('eliminar pide confirmación y dispara onEliminar(observacionId)', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onEliminar = vi.fn().mockResolvedValue(true);
    montar({ onEliminar });

    const botones = screen.getAllByRole('button', { name: 'Eliminar' });
    await user.click(botones[0]!);

    expect(confirmar).toHaveBeenCalled();
    expect(onEliminar).toHaveBeenCalledWith(101);
  });

  it('eliminar cancelado NO llama', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onEliminar = vi.fn();
    montar({ onEliminar });

    await user.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);

    expect(onEliminar).not.toHaveBeenCalled();
  });

  it('editar: precarga la fila y guarda con reemplazaObservacionId', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true);
    montar({ onGuardar });

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]!); // fila 102

    const contenido = screen.getByLabelText('Contenido');
    expect(contenido).toHaveValue('Precio vs. competencia');
    expect(screen.getByLabelText('Título')).toHaveValue('Precio');
    await user.clear(contenido);
    await user.type(contenido, 'Objeción de precio tratada');
    await user.click(screen.getByRole('button', { name: 'Guardar memoria' }));

    expect(onGuardar).toHaveBeenCalledWith({
      nivel: 'chat',
      tipo: 'objecion',
      titulo: 'Precio',
      contenido: 'Objeción de precio tratada',
      reemplazaObservacionId: 102,
    });
  });

  it('+ Nueva memoria: formulario con nivel/tipo/titulo/contenido → onGuardar', async () => {
    const onGuardar = vi.fn().mockResolvedValue(true);
    montar({ onGuardar });

    await user.click(screen.getByRole('button', { name: '+ Nueva memoria' }));

    await user.selectOptions(screen.getByLabelText('Nivel'), 'empresa');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'preferencia');
    await user.type(screen.getByLabelText('Título'), 'Firmas');
    await user.type(screen.getByLabelText('Contenido'), 'Firma presencial, los viernes');
    await user.click(screen.getByRole('button', { name: 'Guardar memoria' }));

    expect(onGuardar).toHaveBeenCalledWith({
      nivel: 'empresa',
      tipo: 'preferencia',
      titulo: 'Firmas',
      contenido: 'Firma presencial, los viernes',
    });
  });

  it('+ Nueva memoria con campos vacíos → validación inline, sin llamar onGuardar', async () => {
    const onGuardar = vi.fn();
    montar({ onGuardar });

    await user.click(screen.getByRole('button', { name: '+ Nueva memoria' }));
    await user.click(screen.getByRole('button', { name: 'Guardar memoria' }));

    expect(screen.getByText('Completá el título y el contenido.')).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('sin empresa vinculada (empresaId null) → la nueva memoria queda deshabilitada con aviso', async () => {
    montar({ empresaId: null });

    const boton = screen.getByRole('button', { name: '+ Nueva memoria' });
    expect(boton).toBeDisabled();
    expect(
      screen.getByText('Vinculá la conversación a una empresa para guardar memorias.'),
    ).toBeInTheDocument();
  });

  it('error de acción → inline, sin crashear', () => {
    montar({ errorAccion: 'La memoria no pertenece a esta conversación' });

    expect(screen.getByRole('alert')).toHaveTextContent('no pertenece');
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
