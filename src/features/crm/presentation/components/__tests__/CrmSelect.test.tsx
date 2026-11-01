import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Phone, Mail, Search } from 'lucide-react';

import { CrmSelect, type OpcionSelect } from '../CrmSelect';

type V = 'nose' | 'referido' | 'internet';

const OPCIONES: OpcionSelect<V>[] = [
  { value: 'nose', label: 'No lo sé', icon: Search },
  { value: 'referido', label: 'Referido por un cliente', icon: Phone, description: 'Otro cliente nos recomendó' },
  { value: 'internet', label: 'Búsqueda en internet', icon: Mail },
];

function Prueba({ inicial = null, onChange }: { inicial?: V | null; onChange?: (v: V) => void }) {
  const [v, setV] = useState<V | null>(inicial);
  return (
    <>
      <CrmSelect
        id="como"
        label="¿Cómo nos conoció?"
        value={v}
        options={OPCIONES}
        placeholder="Elige una opción"
        onChange={(n) => {
          setV(n);
          onChange?.(n);
        }}
      />
      <button type="button">fuera</button>
    </>
  );
}

const boton = () => screen.getByRole('button', { name: /¿Cómo nos conoció\?/ });
const lista = () => screen.queryByRole('listbox');

describe('CrmSelect', () => {
  it('is a button linked to its label that opens a listbox', () => {
    render(<Prueba />);
    const b = boton();
    expect(b).toHaveAttribute('aria-haspopup', 'listbox');
    expect(b).toHaveAttribute('aria-expanded', 'false');
    expect(b).toHaveTextContent('Elige una opción');
    expect(lista()).toBeNull();
    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-expanded', 'true');
    expect(b).toHaveAttribute('aria-controls', lista()?.id);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'No lo sé',
      'Referido por un clienteOtro cliente nos recomendó',
      'Búsqueda en internet',
    ]);
  });

  it('selects with the mouse, closes and returns focus to the button', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.click(boton());
    fireEvent.click(screen.getByRole('option', { name: /Búsqueda en internet/ }));
    expect(onChange).toHaveBeenCalledWith('internet');
    expect(lista()).toBeNull();
    expect(boton()).toHaveFocus();
    expect(boton()).toHaveTextContent('Búsqueda en internet');
  });

  it('works from the keyboard: arrows wrap, Home/End jump, Enter selects', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.keyDown(boton(), { key: 'ArrowDown' });
    const l = lista() as HTMLElement;
    expect(l).toHaveFocus();
    const activa = () => l.getAttribute('aria-activedescendant');
    const ids = screen.getAllByRole('option').map((o) => o.id);
    expect(activa()).toBe(ids[0]);
    fireEvent.keyDown(l, { key: 'ArrowUp' });
    expect(activa()).toBe(ids[2]);
    fireEvent.keyDown(l, { key: 'ArrowDown' });
    expect(activa()).toBe(ids[0]);
    fireEvent.keyDown(l, { key: 'End' });
    expect(activa()).toBe(ids[2]);
    fireEvent.keyDown(l, { key: 'Home' });
    expect(activa()).toBe(ids[0]);
    fireEvent.keyDown(l, { key: 'ArrowDown' });
    fireEvent.keyDown(l, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('referido');
    expect(boton()).toHaveFocus();
  });

  it('jumps by first letter and selects with Space', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.keyDown(boton(), { key: 'ArrowDown' });
    fireEvent.keyDown(lista() as HTMLElement, { key: 'b' });
    fireEvent.keyDown(lista() as HTMLElement, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith('internet');
  });

  it('opens on the selected option and marks it aria-selected', () => {
    render(<Prueba inicial="referido" />);
    fireEvent.click(boton());
    const sel = screen.getByRole('option', { name: /Referido/ });
    expect(sel).toHaveAttribute('aria-selected', 'true');
    expect(lista()).toHaveAttribute('aria-activedescendant', sel.id);
    expect(screen.getByRole('option', { name: 'No lo sé' })).toHaveAttribute('aria-selected', 'false');
  });

  it('closes with Escape (focus back) and with a click outside, without changing the value', () => {
    const onChange = vi.fn();
    render(<Prueba onChange={onChange} />);
    fireEvent.click(boton());
    fireEvent.keyDown(lista() as HTMLElement, { key: 'Escape' });
    expect(lista()).toBeNull();
    expect(boton()).toHaveFocus();
    fireEvent.click(boton());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fuera' }));
    expect(lista()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps only one menu open at a time', () => {
    render(
      <>
        <Prueba />
        <CrmSelect id="otro" label="Qué hacer" value={null} options={OPCIONES} placeholder="Elige" onChange={() => {}} />
      </>,
    );
    fireEvent.click(boton());
    fireEvent.click(screen.getByRole('button', { name: /Qué hacer/ }));
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
    expect(boton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('highlights the closed control with an even sky border once a value is chosen (S9)', () => {
    const { rerender } = render(
      <CrmSelect id="x" label="L" value={null} options={OPCIONES} placeholder="Elige" onChange={() => {}} />,
    );
    const b = screen.getByRole('button', { name: /L/ });
    expect(b.className).not.toContain('bg-sky-100');
    rerender(<CrmSelect id="x" label="L" value="nose" options={OPCIONES} placeholder="Elige" onChange={() => {}} />);
    // Same border on all four sides: a uniform border color plus an inset ring, never a side-specific border.
    expect(b.className).toContain('bg-sky-100');
    expect(b.className).toContain('border-sky-500');
    expect(b.className).toContain('ring-inset');
    expect(b.className).not.toMatch(/\bborder-[lrtbxy]-/);
  });

  it('shows the invalid state instead of the highlight', () => {
    render(
      <CrmSelect id="x" label="L" value="nose" options={OPCIONES} placeholder="Elige" onChange={() => {}} invalid describedBy="x-err" />,
    );
    const b = screen.getByRole('button', { name: /L/ });
    expect(b).toHaveAttribute('aria-invalid', 'true');
    expect(b).toHaveAttribute('aria-describedby', 'x-err');
    expect(b.className).toContain('border-red-500');
    expect(b.className).not.toContain('bg-sky-100');
  });
});
