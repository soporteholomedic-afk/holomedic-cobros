import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FichaContacto } from '../FichaContacto';
import type { FichaConversacion } from '../../../../domain/entities';

/**
 * Render contract for the right column's contact card (E3·T5, mockup
 * .side '📇 Datos del contacto'): rows Nombre/Cargo/Trabajadores/
 * Sedes/Teléfono; a pending value renders '— por detectar —'; IA-origin
 * rows carry the '🤖' tag; the confirm interaction opens an inline
 * editor per row that calls onConfirmar(campo, valor) — canonical rows
 * render plain (no tag) but stay editable (operator override).
 */

const FICHA: FichaConversacion = {
  conversacionId: 7,
  contacto: { id: 11, nombre: 'Juan Pérez', telefono: '+595981402211', cargo: 'Jefe de RRHH' },
  empresa: { id: 1, razonSocial: 'ACME S.A.', cantidadTrabajadores: 120 },
  datos: {
    // canonico: la columna canónica manda (sin tag, editable igual).
    cargo: { valor: 'Jefe de RRHH', origen: 'canonico', confirmado: true },
    // IA: extraído por la Guía → lleva el tag 🤖.
    trabajadores: { valor: '120', origen: 'IA', confirmado: false },
    // HUMANO confirmado.
    sedes: { valor: 'Encarnación + Asunción', origen: 'HUMANO', confirmado: true },
  },
};

const user = userEvent.setup();

function montar(sobres: Partial<Parameters<typeof FichaContacto>[0]> = {}): ReturnType<typeof render> {
  const props: Parameters<typeof FichaContacto>[0] = {
    ficha: FICHA,
    status: 'ready',
    error: null,
    confirmando: false,
    errorConfirmacion: null,
    onConfirmar: () => Promise.resolve(true),
    ...sobres,
  };
  return render(<FichaContacto {...props} />);
}

describe('FichaContacto (E3·T5)', () => {
  it('renderiza el título y las cinco filas con sus valores', () => {
    montar();

    expect(screen.getByText('📇 Datos del contacto')).toBeInTheDocument();
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Jefe de RRHH')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Encarnación + Asunción')).toBeInTheDocument();
    expect(screen.getByText('+595 981 402 211')).toBeInTheDocument(); // formateado
  });

  it('valor pendiente → «— por detectar —»; fila IA lleva el tag 🤖; canónica va limpia', () => {
    montar({
      ficha: {
        ...FICHA,
        contacto: { ...FICHA.contacto!, cargo: null },
        datos: {
          cargo: { valor: null, origen: 'IA', confirmado: false },
          trabajadores: FICHA.datos.trabajadores,
          sedes: FICHA.datos.sedes,
        },
      },
    });

    const pendientes = screen.getAllByText('— por detectar —');
    expect(pendientes).toHaveLength(1);
    // La fila IA (trabajadores) lleva su tag con título explicativo.
    expect(screen.getByTitle('Extraído por la Guía')).toBeInTheDocument();
    // Cargo pendiente: sin tag IA (no hay dato).
    expect(screen.queryAllByTitle('Extraído por la Guía')).toHaveLength(1);
  });

  it('confirmar un dato: click en el valor → editor inline → onConfirmar(campo, valor)', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(true);
    montar({ onConfirmar });

    // Click sobre el valor pendiente/IA/canónico abre el editor de esa fila.
    await user.click(screen.getByText('120'));
    const editor = screen.getByLabelText('Valor para trabajadores');
    await user.clear(editor);
    await user.type(editor, '135');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onConfirmar).toHaveBeenCalledWith('trabajadores', '135');
    // Éxito → el editor se cierra.
    await vi.waitFor(() =>
      expect(screen.queryByLabelText('Valor para trabajadores')).not.toBeInTheDocument(),
    );
  });

  it('editar un valor existente parte del valor actual; cancelar no llama', async () => {
    const onConfirmar = vi.fn();
    montar({ onConfirmar });

    await user.click(screen.getByText('Encarnación + Asunción'));
    const editor = screen.getByLabelText('Valor para sedes');
    expect(editor).toHaveValue('Encarnación + Asunción');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Valor para sedes')).not.toBeInTheDocument();
  });

  it('fallo de la confirmación → error inline, editor abierto con el texto', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(false);
    montar({ onConfirmar, errorConfirmacion: 'La conversación no tiene empresa vinculada' });

    await user.click(screen.getByText('120'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('empresa vinculada');
    expect(screen.getByLabelText('Valor para trabajadores')).toBeInTheDocument();
  });

  it('status loading → esqueleto; error → mensaje, sin crashear', () => {
    const { rerender } = montar({ status: 'loading', ficha: null });
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(
      <FichaContacto
        ficha={null}
        status="error"
        error="HTTP 500"
        confirmando={false}
        errorConfirmacion={null}
        onConfirmar={() => Promise.resolve(true)}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500');
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
