/**
 * PR envio-resultados CAMO/EMO wizard — WU-3.1.
 *
 * `Step4Resumen` is the read-only summary step. It renders one
 * row per `dni` in `selectedDnIs` with the picked CAMO/EMO
 * filenames (or "—" when not picked / null), and a
 * "Continuar al envío" footer button that calls
 * `onContinueToEmail(buildEmailViewDataFromWizard(...))`.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-007 — Step 4 Resumen + handoff.
 *  - REQ-009 — SelectedFileRef.tipoExamen populated on every ref.
 *  - Scenarios S-011 (summary rows) + S-012 (handoff payload).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Step4Resumen } from '../../wizard/Step4Resumen';
import type { WizardFilePick } from '../../hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Fixtures ----

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PEREZ',
    empresa: 'ACME S.A.C.',
    tipoExamen: 'CAMO',
    proyecto: 'METRO LIMA',
    condic: '',
    fichas: [
      {
        idAten: 'AT-001',
        nroRuc: '20123456789',
        nomCFa: 'ACME S.A.C.',
        proyecto: 'METRO LIMA',
        tipoExamen: 'CAMO',
        condic: '',
      },
    ],
    ...overrides,
  };
}

function makeCamo(dni: string, name: string): WizardFilePick {
  const ref: SelectedFileRef = {
    ruc: '20123456789',
    dni,
    idAten: 'AT-001',
    path: 'LEGAJOS',
    name,
    tipoExamen: 'CAMO',
  };
  return { ref, displayName: name };
}

function makeEmo(dni: string, name: string): WizardFilePick {
  const ref: SelectedFileRef = {
    ruc: '20123456789',
    dni,
    idAten: 'AT-001',
    path: 'LEGAJOS',
    name,
    tipoExamen: 'EMO',
  };
  return { ref, displayName: name };
}

// ---- Helpers ----

function renderStep4(
  overrides: Partial<React.ComponentProps<typeof Step4Resumen>> = {},
) {
  const onContinueToEmail = vi.fn();
  const props: React.ComponentProps<typeof Step4Resumen> = {
    people: [makePerson()],
    selectedDnIs: new Set(['12345678']),
    camoByDni: {},
    emoByDni: {},
    onContinueToEmail,
    ...overrides,
  };
  const utils = render(<Step4Resumen {...props} />);
  return { ...utils, onContinueToEmail };
}

// ================================================================

describe('Step4Resumen', () => {
  it('renders one row per dni in selectedDnIs', () => {
    const people = [
      makePerson({ dni: '11111111', nombre: 'ANA LOPEZ' }),
      makePerson({ dni: '22222222', nombre: 'BETO RUIZ' }),
    ];
    renderStep4({ people, selectedDnIs: new Set(['11111111', '22222222']) });
    expect(screen.getByTestId('step4-row-11111111')).toBeInTheDocument();
    expect(screen.getByTestId('step4-row-22222222')).toBeInTheDocument();
  });

  it('each row shows the patient name', () => {
    renderStep4();
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByText('JUAN PEREZ')).toBeInTheDocument();
  });

  it('shows "—" for CAMO + EMO when both picks are missing', () => {
    renderStep4();
    const row = screen.getByTestId('step4-row-12345678');
    // The CAMO and EMO cells both render an em-dash placeholder.
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('—');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('—');
  });

  it('shows the picked CAMO filename + "—" for EMO when only CAMO is picked', () => {
    renderStep4({
      camoByDni: { '12345678': makeCamo('12345678', '75618561CERT.pdf') },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('75618561CERT.pdf');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('—');
  });

  it('shows the picked EMO filename + "—" for CAMO when only EMO is picked', () => {
    renderStep4({
      emoByDni: { '12345678': makeEmo('12345678', '75618561EXPED.pdf') },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('—');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('75618561EXPED.pdf');
  });

  it('shows both filenames when both picks are present', () => {
    renderStep4({
      camoByDni: { '12345678': makeCamo('12345678', 'CERT.pdf') },
      emoByDni: { '12345678': makeEmo('12345678', 'EXPED.pdf') },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('CERT.pdf');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('EXPED.pdf');
  });

  it('shows "Saltado" for both cells when both picks are null (skipped)', () => {
    renderStep4({
      camoByDni: { '12345678': null },
      emoByDni: { '12345678': null },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('Saltado');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('Saltado');
  });

  it('renders a "Continuar al envío" button', () => {
    renderStep4();
    expect(screen.getByTestId('step4-continuar')).toBeInTheDocument();
    expect(screen.getByTestId('step4-continuar')).toHaveTextContent('Continuar al envío');
  });

  it('clicking "Continuar al envío" calls onContinueToEmail with the helper output', () => {
    const { onContinueToEmail } = renderStep4({
      camoByDni: { '12345678': makeCamo('12345678', 'CERT.pdf') },
      emoByDni: { '12345678': makeEmo('12345678', 'EXPED.pdf') },
    });
    fireEvent.click(screen.getByTestId('step4-continuar'));
    expect(onContinueToEmail).toHaveBeenCalledTimes(1);
    const data = onContinueToEmail.mock.calls[0]?.[0] as {
      selectedPatients: Record<string, { patientName: string; files: string[] }>;
      fileRefs: Array<{ dni: string; name: string; tipoExamen?: 'CAMO' | 'EMO' }>;
    };
    expect(data.selectedPatients).toEqual({
      '12345678': { patientName: 'JUAN PEREZ', files: ['CERT.pdf', 'EXPED.pdf'] },
    });
    expect(data.fileRefs).toHaveLength(2);
    // Each ref carries the correct tipoExamen — proves the helper
    // and the component agree on the type contract.
    expect(data.fileRefs.find((r) => r.name === 'CERT.pdf')?.tipoExamen).toBe('CAMO');
    expect(data.fileRefs.find((r) => r.name === 'EXPED.pdf')?.tipoExamen).toBe('EMO');
  });

  it('clicking "Continuar al envío" with no picks still calls onContinueToEmail with empty fileRefs', () => {
    // Triangulation: the patient row is visible (with "Saltado" /
    // "—") but the handoff payload has zero fileRefs. The wizard
    // shell enriches this to the full EmailViewData; the EmailEditor
    // shows the "no files" warning.
    const { onContinueToEmail } = renderStep4({
      camoByDni: { '12345678': null },
      emoByDni: { '12345678': null },
    });
    fireEvent.click(screen.getByTestId('step4-continuar'));
    const data = onContinueToEmail.mock.calls[0]?.[0] as {
      fileRefs: unknown[];
      selectedPatients: Record<string, { patientName: string }>;
    };
    expect(data.fileRefs).toEqual([]);
    expect(data.selectedPatients['12345678']?.patientName).toBe('JUAN PEREZ');
  });

  it('renders multiple patients in iteration order of selectedDnIs', () => {
    // Triangulation: order matters because the EmailEditor recipient
    // list and the "toEmail" hint both follow the row order.
    const people = [
      makePerson({ dni: '11111111', nombre: 'ANA LOPEZ' }),
      makePerson({ dni: '22222222', nombre: 'BETO RUIZ' }),
      makePerson({ dni: '33333333', nombre: 'CARLA SOTO' }),
    ];
    const { container } = renderStep4({
      people,
      selectedDnIs: new Set(['33333333', '11111111', '22222222']),
      camoByDni: {
        '33333333': makeCamo('33333333', 'C.pdf'),
        '11111111': makeCamo('11111111', 'A.pdf'),
        '22222222': makeCamo('22222222', 'B.pdf'),
      },
    });
    const rows = container.querySelectorAll('[data-testid^="step4-row-"]');
    // Iteration order: 33333333 → 11111111 → 22222222 (Set preserves
    // insertion order in JS).
    const rowOrder = Array.from(rows).map((el) =>
      el.getAttribute('data-testid')?.replace('step4-row-', ''),
    );
    expect(rowOrder).toEqual(['33333333', '11111111', '22222222']);
  });
});
