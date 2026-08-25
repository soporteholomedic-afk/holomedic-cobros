import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignatureEditor } from '../SignatureEditor';

const fields = [
  { key: 'name', label: 'Nombre' },
  { key: 'email', label: 'Email' },
] as const;

describe('SignatureEditor', () => {
  it('renders one input per field, seeded from values', () => {
    render(
      <SignatureEditor
        fields={[...fields]}
        values={{ name: 'María Pérez', email: 'maria@holomedic.com.pe' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Nombre')).toHaveValue('María Pérez');
    expect(screen.getByLabelText('Email')).toHaveValue('maria@holomedic.com.pe');
  });

  it('delegates edits to onChange with the field key', () => {
    const onChange = vi.fn();
    render(
      <SignatureEditor
        fields={[...fields]}
        values={{ name: 'María Pérez', email: 'maria@holomedic.com.pe' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'María E. Pérez' } });
    expect(onChange).toHaveBeenCalledWith('name', 'María E. Pérez');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'otra@holomedic.com.pe' } });
    expect(onChange).toHaveBeenCalledWith('email', 'otra@holomedic.com.pe');
  });

  it('renders an empty input for a field whose value is empty', () => {
    render(
      <SignatureEditor
        fields={[...fields]}
        values={{ name: 'María Pérez', email: '' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });
});
