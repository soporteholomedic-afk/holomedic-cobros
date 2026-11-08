import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { BusquedaDebounced } from '../BusquedaDebounced';
import { EncabezadoOrdenable } from '../EncabezadoOrdenable';
import { FiltroDropdown } from '../FiltroDropdown';
import { Paginador } from '../Paginador';

let base: typeof fetch;
beforeEach(() => {
  base = global.fetch;
});
afterEach(() => {
  global.fetch = base;
  vi.useRealTimers();
});

describe('BusquedaDebounced — búsqueda con debounce y limpiar (S17)', () => {
  it('debounces 300 ms before notifying, and the clear button resets immediately', async () => {
    vi.useFakeTimers();
    const onBusca = vi.fn();
    render(<BusquedaDebounced valor="" onBusca={onBusca} etiqueta="Buscar" />);
    const input = screen.getByLabelText('Buscar');
    fireEvent.change(input, { target: { value: 'miner' } });
    fireEvent.change(input, { target: { value: 'minera ant' } });
    expect(onBusca).not.toHaveBeenCalled(); // todavía debunciendo
    await vi.advanceTimersByTimeAsync(320);
    expect(onBusca).toHaveBeenCalledWith('minera ant');

    fireEvent.click(screen.getByRole('button', { name: /limpiar búsqueda/i }));
    expect(onBusca).toHaveBeenCalledWith('');
  });

  it('shows the incoming value (controlled component)', () => {
    render(<BusquedaDebounced valor="abc" onBusca={vi.fn()} etiqueta="Buscar" />);
    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('abc');
  });
});

describe('FiltroDropdown — dropdown propio, sin <select> nativo (S17)', () => {
  const OPCIONES = [
    { valor: '', etiqueta: 'Todos los sectores' },
    { valor: 'Odontología', etiqueta: 'Odontología' },
    { valor: 'Minería y Energía', etiqueta: 'Minería y Energía' },
  ];

  it('opens a custom popup, selects an option and closes on Escape', async () => {
    const onCambia = vi.fn();
    render(<FiltroDropdown etiqueta="Sector" opciones={OPCIONES} valor="" onCambia={onCambia} />);
    expect(screen.queryByRole('listbox')).toBeNull(); // cerrado: sin popup
    fireEvent.click(screen.getByRole('button', { name: /Sector/ }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Odontología' }));
    expect(onCambia).toHaveBeenCalledWith('Odontología');
    expect(screen.queryByRole('listbox')).toBeNull(); // cierra al elegir
  });

  it('closes on Escape without selecting and marks the current value', () => {
    render(<FiltroDropdown etiqueta="Sector" opciones={OPCIONES} valor="Odontología" onCambia={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Sector/ }));
    const opciones = screen.getAllByRole('option');
    expect(opciones[1].getAttribute('aria-selected')).toBe('true'); // Odontología
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('no native <select> anywhere', () => {
    render(<FiltroDropdown etiqueta="Sector" opciones={OPCIONES} valor="" onCambia={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Sector/ }));
    expect(document.querySelector('select')).toBeNull();
  });
});

describe('EncabezadoOrdenable — orden por columna con aria-sort (S15)', () => {
  it('clicks cycle none → desc → asc and expose aria-sort', () => {
    const onOrden = vi.fn();
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <EncabezadoOrdenable etiqueta="Sin actividad" campo="abandono" orden={null} direccion={null} onOrden={onOrden} />
          </tr>
        </thead>
      </table>,
    );
    const boton = screen.getByRole('button', { name: /Sin actividad/ });
    const th = boton.closest('th')!;
    expect(th.getAttribute('aria-sort')).toBe('none');
    fireEvent.click(boton);
    expect(onOrden).toHaveBeenCalledWith('abandono', 'desc');
    rerender(
      <table>
        <thead>
          <tr>
            <EncabezadoOrdenable etiqueta="Sin actividad" campo="abandono" orden="abandono" direccion="desc" onOrden={onOrden} />
          </tr>
        </thead>
      </table>,
    );
    expect(th.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /Sin actividad/ }));
    expect(onOrden).toHaveBeenCalledWith('abandono', 'asc');
  });

  it('razonSocial starts ascending (alfabético)', () => {
    const onOrden = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <EncabezadoOrdenable etiqueta="Empresa" campo="razonSocial" orden={null} direccion={null} onOrden={onOrden} />
          </tr>
        </thead>
      </table>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Empresa/ }));
    expect(onOrden).toHaveBeenCalledWith('razonSocial', 'asc');
  });
});

describe('Paginador — prev/next con estados (S16)', () => {
  it('disables edges and reports page changes', () => {
    const onPagina = vi.fn();
    render(<Paginador pagina={1} paginas={65} onPagina={onPagina} />);
    expect(screen.getByText(/Página 1 de 65/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /anterior/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /primera/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(onPagina).toHaveBeenCalledWith(2);
  });

  it('reaches the last page and disables forward controls there', () => {
    const onPagina = vi.fn();
    const { rerender } = render(<Paginador pagina={1} paginas={3} onPagina={onPagina} />);
    fireEvent.click(screen.getByRole('button', { name: /última/i }));
    expect(onPagina).toHaveBeenCalledWith(3);
    rerender(<Paginador pagina={3} paginas={3} onPagina={onPagina} />);
    expect((screen.getByRole('button', { name: /siguiente/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /última/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
