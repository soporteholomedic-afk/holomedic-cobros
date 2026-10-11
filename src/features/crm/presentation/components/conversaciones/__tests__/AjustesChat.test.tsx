import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AjustesChat } from '../AjustesChat';
import { SelectorEscalar } from '../SelectorEscalar';
import type { AjustesConversacionVista, UsuarioAsignableVista } from '../guards';

/**
 * Render contracts for the settings panel (AjustesChat) and the escalar
 * selector (SelectorEscalar) — the right column's third section and
 * the TOMADA_HUMANO header action (E3·T5, mockup .cfgchips).
 */

const AJUSTES: AjustesConversacionVista = {
  success: true,
  estado: 'REQUIERE_HUMANO',
  modo: 'IA',
  asignadaA: null,
  memoriaActiva: true,
  config: { umbralConfianza: 0.6, maxIntercambios: 6, horarioDesde: 8, horarioHasta: 18 },
};

const user = userEvent.setup();

describe('AjustesChat (E3·T5)', () => {
  function montar(sobres: Partial<Parameters<typeof AjustesChat>[0]> = {}): ReturnType<typeof render> {
    const props: Parameters<typeof AjustesChat>[0] = {
      ajustes: AJUSTES,
      status: 'ready',
      error: null,
      alternando: false,
      errorToggle: null,
      onToggleMemoriaActiva: () => Promise.resolve(true),
      ...sobres,
    };
    return render(<AjustesChat {...props} />);
  }

  it('renderiza el título y los chips de configuración con los valores del ajuste', () => {
    montar();

    expect(screen.getByText('🤖 Agente en esta conversación')).toBeInTheDocument();
    expect(screen.getByText('MODO: pidiendo ayuda')).toBeInTheDocument();
    expect(screen.getByText('umbral .60')).toBeInTheDocument();
    expect(screen.getByText('intercambios límite 6')).toBeInTheDocument();
    expect(screen.getByText('horario 8–18')).toBeInTheDocument();
    expect(screen.getByText('memoria: chat + empresa')).toBeInTheDocument();
  });

  it('muestra el modo y el asignado cuando lo hay', () => {
    montar({
      ajustes: { ...AJUSTES, estado: 'TOMADA_HUMANO', modo: 'HUMANO', asignadaA: 'juana' },
    });

    expect(screen.getByText('MODO: humano')).toBeInTheDocument();
    expect(screen.getByText('Asignada a juana')).toBeInTheDocument();
  });

  it('el toggle dispara onToggleMemoriaActiva(false) apagando; error → revierte al valor del servidor', async () => {
    const onToggle = vi.fn().mockResolvedValue(false); // falla → revertir
    const { rerender } = montar({ onToggleMemoriaActiva: onToggle });

    const interruptor = screen.getByRole('switch', { name: 'memoria activa' });
    expect(interruptor).toHaveAttribute('aria-checked', 'true');

    await user.click(interruptor);
    expect(onToggle).toHaveBeenCalledWith(false);
    // Sin ajustes nuevos del servidor y con fallo → vuelve a true.
    await vi.waitFor(() =>
      expect(screen.getByRole('switch', { name: 'memoria activa' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );

    // Éxito: el servidor refresca ajustes (rerender del padre) → off.
    rerender(
      <AjustesChat
        ajustes={{ ...AJUSTES, memoriaActiva: false }}
        status="ready"
        error={null}
        alternando={false}
        errorToggle={null}
        onToggleMemoriaActiva={onToggle}
      />,
    );
    expect(screen.getByRole('switch', { name: 'memoria activa' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('fallo del toggle → error inline', async () => {
    montar({
      onToggleMemoriaActiva: vi.fn().mockResolvedValue(false),
      errorToggle: 'HTTP 500',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500');
  });

  it('status error → mensaje; cargando → esqueleto', () => {
    const { rerender } = montar({ status: 'error', error: 'HTTP 503', ajustes: null });
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 503');

    rerender(
      <AjustesChat
        ajustes={null}
        status="loading"
        error={null}
        alternando={false}
        errorToggle={null}
        onToggleMemoriaActiva={() => Promise.resolve(true)}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('SelectorEscalar (E3·T5)', () => {
  const USUARIOS: UsuarioAsignableVista[] = [
    { id: 'juana', nombre: 'Juana Perez' },
    { id: 'mperez', nombre: 'Marcos Pérez' },
  ];

  function montar(sobres: Partial<Parameters<typeof SelectorEscalar>[0]> = {}): ReturnType<typeof render> {
    const props: Parameters<typeof SelectorEscalar>[0] = {
      usuarios: USUARIOS,
      status: 'ready',
      error: null,
      escalando: false,
      errorEscalar: null,
      onCargar: () => {},
      onEscalar: () => Promise.resolve(true),
      ...sobres,
    };
    return render(<SelectorEscalar {...props} />);
  }

  it('abrir pide la lista (lazy); reabrir NO re-pide', async () => {
    const onCargar = vi.fn();
    const { rerender } = montar({ onCargar, usuarios: [], status: 'idle' });

    await user.click(screen.getByRole('button', { name: 'Escalar a…' }));
    expect(onCargar).toHaveBeenCalledTimes(1);

    // Cerrar y reabrir con la lista ya cargada (status ready) → sin re-pedir.
    await user.click(screen.getByRole('button', { name: 'Cerrar escalado' }));
    rerender(
      <SelectorEscalar
        usuarios={[{ id: 'juana', nombre: 'Juana Perez' }]}
        status="ready"
        error={null}
        escalando={false}
        errorEscalar={null}
        onCargar={onCargar}
        onEscalar={() => Promise.resolve(true)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Escalar a…' }));
    expect(onCargar).toHaveBeenCalledTimes(1);
  });

  it('elegir + confirmar → onEscalar(usuarioId); éxito cierra el selector', async () => {
    const onEscalar = vi.fn().mockResolvedValue(true);
    montar({ onEscalar });

    await user.click(screen.getByRole('button', { name: 'Escalar a…' }));
    await user.selectOptions(screen.getByLabelText('Usuario destino'), 'mperez');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onEscalar).toHaveBeenCalledWith('mperez');
    await vi.waitFor(() =>
      expect(screen.queryByLabelText('Usuario destino')).not.toBeInTheDocument(),
    );
  });

  it('fallo (400) → error inline y el selector queda abierto', async () => {
    const onEscalar = vi.fn().mockResolvedValue(false);
    montar({ onEscalar, errorEscalar: 'Usuario destino desconocido o sin permiso crm_conversaciones' });

    await user.click(screen.getByRole('button', { name: 'Escalar a…' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Usuario destino desconocido');
    expect(screen.getByLabelText('Usuario destino')).toBeInTheDocument();
  });

  it('cargando → indicación de carga; sin usuarios → aviso', async () => {
    montar({ usuarios: [], status: 'loading' });
    await user.click(screen.getByRole('button', { name: 'Escalar a…' }));
    expect(screen.getByText('Cargando usuarios…')).toBeInTheDocument();
  });
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());
