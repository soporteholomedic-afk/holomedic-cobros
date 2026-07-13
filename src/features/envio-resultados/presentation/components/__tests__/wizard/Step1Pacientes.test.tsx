/**
 * PR envio-resultados CAMO/EMO wizard — WU-2a.2.
 *
 * `Step1Pacientes` is the first sub-component of the envio wizard.
 * It renders a multi-select list of `UnifiedPerson` rows so the
 * operator can pick which patients to send. The component is
 * presentational — selection state is owned by `useEnvioWizard` and
 * forwarded via the `selectedDnIs` set.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-004 — Step 1 Pacientes: lists `UnifiedPerson[]`, toggles
 *    via chips/rows; "Saltar" closes wizard; "Siguiente" disabled
 *    when 0 selected.
 *  - Scenarios S-003, S-004, S-005.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Step1Pacientes } from '../../wizard/Step1Pacientes';
import type { UnifiedPerson } from '@/types/sp-result';

// ---- Fixtures ----

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'Juan Pérez',
    empresa: 'Acme Corp',
    tipoExamen: 'CERT',
    proyecto: 'METRO LIMA',
    condic: 'APTO',
    fichas: [],
    ...overrides,
  };
}

const people: ReadonlyArray<UnifiedPerson> = [
  makePerson({ dni: '11111111', nombre: 'Ana López' }),
  makePerson({ dni: '22222222', nombre: 'Beto Ruiz' }),
  makePerson({ dni: '33333333', nombre: 'Carla Soto' }),
];

// ---- Helpers ----

function renderStep1(
  overrides: Partial<React.ComponentProps<typeof Step1Pacientes>> = {},
) {
  const onToggle = vi.fn();
  const onSaltar = vi.fn();
  const onNext = vi.fn();
  const props: React.ComponentProps<typeof Step1Pacientes> = {
    people,
    selectedDnIs: new Set<string>(),
    onToggle,
    onSaltar,
    onNext,
    ...overrides,
  };
  const utils = render(<Step1Pacientes {...props} />);
  return { ...utils, onToggle, onSaltar, onNext };
}

// ================================================================

describe('Step1Pacientes', () => {
  it('renders one row per UnifiedPerson with name and DNI', () => {
    renderStep1();
    for (const person of people) {
      const row = screen.getByTestId(`step1-row-${person.dni}`);
      expect(row).toBeInTheDocument();
      const text = within(row).getByText(person.nombre);
      expect(text).toBeInTheDocument();
      // DNI is rendered with a "DNI " prefix in the row, so use a
      // substring matcher instead of an exact string match.
      expect(within(row).getByText(new RegExp(person.dni))).toBeInTheDocument();
    }
  });

  it('marks a row as selected when its dni is in selectedDnIs', () => {
    renderStep1({ selectedDnIs: new Set(['11111111']) });
    const row = screen.getByTestId('step1-row-11111111');
    // The selected row carries data-selected="true" so tests can target
    // it directly and CSS can style the indicator (checkmark / accent).
    expect(row).toHaveAttribute('data-selected', 'true');

    // Other rows are NOT marked.
    expect(screen.getByTestId('step1-row-22222222')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('step1-row-33333333')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking a row calls onToggle with the row dni', () => {
    const { onToggle } = renderStep1();
    fireEvent.click(screen.getByTestId('step1-row-22222222'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('22222222');
  });

  it('disables the "Siguiente" button when no patient is selected', () => {
    renderStep1({ selectedDnIs: new Set<string>() });
    const siguiente = screen.getByTestId('step1-siguiente');
    expect(siguiente).toBeInTheDocument();
    expect(siguiente).toBeDisabled();
  });

  it('enables the "Siguiente" button when one or more patients are selected', () => {
    const { unmount } = renderStep1({ selectedDnIs: new Set(['11111111']) });
    expect(screen.getByTestId('step1-siguiente')).toBeEnabled();
    unmount();

    render(
      <Step1Pacientes
        people={people}
        selectedDnIs={new Set(['11111111', '22222222', '33333333'])}
        onToggle={vi.fn()}
        onSaltar={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByTestId('step1-siguiente')).toBeEnabled();
  });

  it('clicking "Siguiente" calls onNext', () => {
    const { onNext } = renderStep1({ selectedDnIs: new Set(['11111111']) });
    fireEvent.click(screen.getByTestId('step1-siguiente'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clicking "Saltar" calls onSaltar (which the parent uses to close the wizard)', () => {
    const { onSaltar } = renderStep1();
    fireEvent.click(screen.getByTestId('step1-saltar'));
    expect(onSaltar).toHaveBeenCalledTimes(1);
  });

  it('renders the step header label "Paso 1 — Pacientes"', () => {
    renderStep1();
    expect(screen.getByText(/Paso 1/)).toBeInTheDocument();
    expect(screen.getByText(/Pacientes/)).toBeInTheDocument();
  });

  it('shows the "Saltar" button in the footer (always enabled)', () => {
    renderStep1();
    const saltar = screen.getByTestId('step1-saltar');
    expect(saltar).toBeEnabled();
  });
});
