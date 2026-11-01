import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { CrmCalendario } from '../CrmCalendario';

// 2026-10-30 is a Friday.
const HOY = '2026-10-30';

function Prueba({
  inicial = null,
  onChange,
  marcados,
}: {
  inicial?: string | null;
  onChange?: (v: string) => void;
  marcados?: Record<string, number>;
}) {
  const [v, setV] = useState<string | null>(inicial);
  return (
    <CrmCalendario
      id="fec"
      label="Cuándo"
      value={v}
      hoy={HOY}
      marcados={marcados}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
    />
  );
}

const boton = () => screen.getByRole('button', { name: /Cuándo/ });
const dialogo = () => screen.queryByRole('dialog', { name: 'Elegir la fecha de la próxima acción' });
const dia = (nombre: RegExp) => within(dialogo() as HTMLElement).getByRole('button', { name: nombre });

describe('CrmCalendario', () => {
  it('shows a placeholder and opens a dialog with the month of today', () => {
    render(<Prueba />);
    expect(boton()).toHaveTextContent('Elige una fecha');
    expect(boton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(dialogo()).toBeNull();
    fireEvent.click(boton());
    expect(boton()).toHaveAttribute('aria-expanded', 'true');
    expect(within(dialogo() as HTMLElement).getByText('octubre 2026')).toBeInTheDocument();
    // Focus goes into the grid, on today.
    expect(dia(/^viernes 30 de octubre, hoy/)).toHaveFocus();
    expect(dia(/^viernes 30 de octubre, hoy/)).toHaveAttribute('aria-current', 'date');
  });

  it('disables past days and the previous month on the current month', () => {
    render(<Prueba />);
    fireEvent.click(boton());
    expect(dia(/^jueves 29 de octubre/)).toBeDisabled();
    expect(dia(/^sábado 31 de octubre/)).toBeEnabled();
    expect(within(dialogo() as HTMLElement).getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    fireEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Mes siguiente' }));
    expect(within(dialogo() as HTMLElement).getByText('noviembre 2026')).toBeInTheDocument();
    expect(within(dialogo() as HTMLElement).getByRole('button', { name: 'Mes anterior' })).toBeEnabled();
  });

  it('picks a day with the mouse, closes and shows the date on the button', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.click(boton());
    fireEvent.click(within(dialogo() as HTMLElement).getByRole('button', { name: 'Mes siguiente' }));
    fireEvent.click(dia(/^martes 3 de noviembre/));
    expect(onChange).toHaveBeenCalledWith('2026-11-03');
    expect(dialogo()).toBeNull();
    expect(boton()).toHaveFocus();
    expect(boton()).toHaveTextContent('martes 3 de noviembre de 2026');
  });

  it('navigates with the keyboard and selects with Enter', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.click(boton());
    const d = dialogo() as HTMLElement;
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    expect(dia(/^sábado 31 de octubre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    // Crosses into November.
    expect(within(d).getByText('noviembre 2026')).toBeInTheDocument();
    expect(dia(/^domingo 1 de noviembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(dia(/^domingo 8 de noviembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(dia(/^lunes 2 de noviembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    expect(dia(/^domingo 8 de noviembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'PageDown' });
    expect(dia(/^martes 8 de diciembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2026-12-08');
    expect(dialogo()).toBeNull();
    expect(boton()).toHaveFocus();
    expect(boton()).toHaveTextContent('martes 8 de diciembre de 2026');
  });

  it('never moves the keyboard focus before today', () => {
    render(<Prueba />);
    fireEvent.click(boton());
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(dia(/^viernes 30 de octubre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'PageUp' });
    expect(dia(/^viernes 30 de octubre/)).toHaveFocus();
  });

  it('closes with Escape without changing the value', () => {
    const onChange = vi.fn();
    render(<Prueba inicial="2026-11-02" onChange={onChange} />);
    fireEvent.click(boton());
    expect(dia(/^lunes 2 de noviembre/)).toHaveAttribute('aria-pressed', 'true');
    expect(dia(/^lunes 2 de noviembre/)).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(dialogo()).toBeNull();
    expect(boton()).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers exactly the four quick dates, counting working days from a Friday', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    const grupo = screen.getByRole('group', { name: 'Fechas rápidas' });
    const rapidas = within(grupo).getAllByRole('button');
    expect(rapidas.map((b) => b.textContent)).toEqual([
      'Hoy vie 30 oct',
      'Próximo día hábil lun 2 nov',
      'En 3 días hábiles mié 4 nov',
      'En una semana vie 6 nov',
    ]);
    fireEvent.click(rapidas[1]);
    expect(onChange).toHaveBeenCalledWith('2026-11-02');
    expect(rapidas[1]).toHaveAttribute('aria-pressed', 'true');
    expect(rapidas[0]).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the days with scheduled actions and tells how far the chosen day is', () => {
    render(<Prueba inicial="2026-10-31" marcados={{ '2026-10-31': 2 }} />);
    expect(screen.getByText(/Es mañana\. Cae en fin de semana\. Ese día ya hay 2 acciones agendadas en el CRM\./)).toBeInTheDocument();
    fireEvent.click(boton());
    expect(dia(/^sábado 31 de octubre, 2 acciones agendadas/)).toBeInTheDocument();
  });

  it('exposes the invalid state', () => {
    render(<CrmCalendario id="f" label="Cuándo" value={null} hoy={HOY} onChange={() => {}} invalid describedBy="f-err" />);
    expect(boton()).toHaveAttribute('aria-invalid', 'true');
    expect(boton().getAttribute('aria-describedby')).toContain('f-err');
  });
});
