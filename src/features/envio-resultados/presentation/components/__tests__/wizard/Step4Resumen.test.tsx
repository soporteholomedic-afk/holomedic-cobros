/**
 * `Step4Resumen` is the read-only summary step. It renders one row
 * per `dni` in `selectedDnIs` with the picked CAMO/EMO filenames
 * (or "—" when not picked / "Saltado" when skipped), and a
 * "Continuar al envío" footer button that calls
 * `onContinueToEmail(buildEmailViewDataFromWizard(...))`.
 *
 * Multi-proyecto change (REQ-106): the step shows the live
 * attachment count vs `MAX_FILES` (10); over-limit disables the
 * continuation with an operator-facing message naming the limit and
 * instructing a manual split.
 *
 * Spec coverage:
 *  - REQ-106 — S-106.1 (11 refs blocked), S-106.2 (10 enabled).
 *  - REQ-102 — per-ficha pick display.
 *  - Legacy REQ-007 — Step 4 Resumen + handoff (S-011, S-012).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Step4Resumen } from '../../wizard/Step4Resumen';
import { pickKey, type WizardFilePick } from '../../../hooks/useEnvioWizard';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

// ---- Fixtures ----

function makeFicha(idAten: string, overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten,
    nroRuc: '20123456789',
    nomCFa: 'ACME S.A.C.',
    proyecto: 'METRO LIMA',
    tipoExamen: 'CAMO',
    condic: '',
    fecAte: '17/06/2026',
    ...overrides,
  };
}

function makePerson(overrides: Partial<UnifiedPerson> = {}): UnifiedPerson {
  return {
    dni: '12345678',
    nombre: 'JUAN PEREZ',
    empresa: 'ACME S.A.C.',
    tipoExamen: 'CAMO',
    proyecto: 'METRO LIMA',
    condic: '',
    fichas: [makeFicha('AT-001')],
    ...overrides,
  };
}

function makeCamo(dni: string, idAten: string, name: string): WizardFilePick {
  const ref: SelectedFileRef = {
    ruc: '20123456789',
    dni,
    idAten,
    path: 'LEGAJOS',
    name,
    tipoExamen: 'CAMO',
  };
  return { ref, displayName: name };
}

function makeEmo(dni: string, idAten: string, name: string): WizardFilePick {
  const ref: SelectedFileRef = {
    ruc: '20123456789',
    dni,
    idAten,
    path: 'LEGAJOS',
    name,
    tipoExamen: 'EMO',
  };
  return { ref, displayName: name };
}

/** Patient with N idAten-bearing fichas. */
function makeMultiFichaPerson(dni: string, n: number): UnifiedPerson {
  return makePerson({
    dni,
    fichas: Array.from({ length: n }, (_, i) => makeFicha(`AT-${i + 1}`)),
  });
}

// ---- Helpers ----

function renderStep4(
  overrides: Partial<React.ComponentProps<typeof Step4Resumen>> = {},
) {
  const onContinueToEmail = vi.fn();
  const props: React.ComponentProps<typeof Step4Resumen> = {
    people: [makePerson()],
    selectedDnIs: new Set(['12345678']),
    camoPicks: {},
    emoPicks: {},
    onContinueToEmail,
    ...overrides,
  };
  const utils = render(<Step4Resumen {...props} />);
  return { ...utils, onContinueToEmail };
}

// ================================================================

describe('Step4Resumen — rows and handoff', () => {
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
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('—');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('—');
  });

  it('shows the picked CAMO filename read from the composite key + "—" for EMO', () => {
    renderStep4({
      camoPicks: {
        [pickKey('12345678', 'AT-001')]: makeCamo('12345678', 'AT-001', '75618561CERT.pdf'),
      },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('75618561CERT.pdf');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('—');
  });

  it('shows "Saltado" when the single ficha pick is null', () => {
    renderStep4({
      camoPicks: { [pickKey('12345678', 'AT-001')]: null },
      emoPicks: { [pickKey('12345678', 'AT-001')]: null },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('Saltado');
    expect(within(row).getByTestId('step4-emo-cell-12345678')).toHaveTextContent('Saltado');
  });

  it('aggregates per-ficha picks in one cell ("A.pdf, B.pdf") for a multi-ficha patient', () => {
    const multi = makeMultiFichaPerson('12345678', 2);
    renderStep4({
      people: [multi],
      camoPicks: {
        [pickKey('12345678', 'AT-1')]: makeCamo('12345678', 'AT-1', 'A.pdf'),
        [pickKey('12345678', 'AT-2')]: makeCamo('12345678', 'AT-2', 'B.pdf'),
      },
    });
    const row = screen.getByTestId('step4-row-12345678');
    expect(within(row).getByTestId('step4-camo-cell-12345678')).toHaveTextContent('A.pdf, B.pdf');
  });

  it('renders rows in iteration order of selectedDnIs', () => {
    const people = [
      makePerson({ dni: '11111111', nombre: 'ANA LOPEZ' }),
      makePerson({ dni: '22222222', nombre: 'BETO RUIZ' }),
      makePerson({ dni: '33333333', nombre: 'CARLA SOTO' }),
    ];
    const { container } = renderStep4({
      people,
      selectedDnIs: new Set(['33333333', '11111111', '22222222']),
    });
    const rows = container.querySelectorAll('[data-testid^="step4-row-"]');
    const rowOrder = Array.from(rows).map((el) =>
      el.getAttribute('data-testid')?.replace('step4-row-', ''),
    );
    expect(rowOrder).toEqual(['33333333', '11111111', '22222222']);
  });

  it('clicking "Continuar al envío" calls onContinueToEmail with the helper output (per-ficha picks)', () => {
    const multi = makeMultiFichaPerson('12345678', 2);
    const { onContinueToEmail } = renderStep4({
      people: [multi],
      camoPicks: {
        [pickKey('12345678', 'AT-1')]: makeCamo('12345678', 'AT-1', 'CERT-1.pdf'),
        [pickKey('12345678', 'AT-2')]: makeCamo('12345678', 'AT-2', 'CERT-2.pdf'),
      },
      emoPicks: {
        [pickKey('12345678', 'AT-1')]: makeEmo('12345678', 'AT-1', 'EXPED-1.pdf'),
      },
    });
    fireEvent.click(screen.getByTestId('step4-continuar'));
    expect(onContinueToEmail).toHaveBeenCalledTimes(1);
    const data = onContinueToEmail.mock.calls[0]?.[0] as {
      selectedPatients: Record<string, { patientName: string; files: string[] }>;
      fileRefs: Array<{ dni: string; idAten: string; name: string; tipoExamen?: string }>;
    };
    // One fileRef per picked slot — 3 refs with distinct idAten.
    expect(data.fileRefs).toHaveLength(3);
    const idAtens = data.fileRefs.map((r) => r.idAten);
    expect(idAtens).toEqual(['AT-1', 'AT-1', 'AT-2']);
    expect(data.selectedPatients['12345678']?.files).toEqual(['CERT-1.pdf', 'EXPED-1.pdf', 'CERT-2.pdf']);
  });

  it('clicking with no picks still calls onContinueToEmail with empty fileRefs', () => {
    const { onContinueToEmail } = renderStep4();
    fireEvent.click(screen.getByTestId('step4-continuar'));
    const data = onContinueToEmail.mock.calls[0]?.[0] as {
      fileRefs: unknown[];
      selectedPatients: Record<string, { patientName: string }>;
    };
    expect(data.fileRefs).toEqual([]);
    expect(data.selectedPatients['12345678']?.patientName).toBe('JUAN PEREZ');
  });
});

// ================================================================
// REQ-106 — MAX_FILES=10 operator block
// ================================================================

describe('Step4Resumen — attachment count vs MAX_FILES', () => {
  function picksFor(count: number): {
    camoPicks: Record<string, WizardFilePick>;
    emoPicks: Record<string, WizardFilePick>;
    people: UnifiedPerson[];
  } {
    // 6-ficha patient: 6 CAMO slots + 6 EMO slots = 12 max picks.
    const person = makeMultiFichaPerson('12345678', 6);
    const camoPicks: Record<string, WizardFilePick> = {};
    const emoPicks: Record<string, WizardFilePick> = {};
    let remaining = count;
    for (let i = 1; i <= 6 && remaining > 0; i++) {
      camoPicks[pickKey('12345678', `AT-${i}`)] = makeCamo('12345678', `AT-${i}`, `C${i}.pdf`);
      remaining--;
    }
    for (let i = 1; i <= 6 && remaining > 0; i++) {
      emoPicks[pickKey('12345678', `AT-${i}`)] = makeEmo('12345678', `AT-${i}`, `E${i}.pdf`);
      remaining--;
    }
    return { camoPicks, emoPicks, people: [person] };
  }

  it('shows the live attachment count vs the limit', () => {
    renderStep4();
    expect(screen.getByTestId('step4-count')).toHaveTextContent('0/10');
  });

  it('S-106.1: 11 refs show over-limit, block continuation with the limit named and a manual-split instruction', () => {
    const { onContinueToEmail } = renderStep4(picksFor(11));
    expect(screen.getByTestId('step4-count')).toHaveTextContent('11/10');
    expect(screen.getByTestId('step4-over-limit')).toBeInTheDocument();
    const message = screen.getByTestId('step4-over-limit').textContent ?? '';
    expect(message).toContain('10');
    expect(message).toContain('11');
    const button = screen.getByTestId('step4-continuar');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onContinueToEmail).not.toHaveBeenCalled();
  });

  it('S-106.2: exactly 10 refs keep continuation enabled (inclusive boundary)', () => {
    const { onContinueToEmail } = renderStep4(picksFor(10));
    expect(screen.getByTestId('step4-count')).toHaveTextContent('10/10');
    expect(screen.queryByTestId('step4-over-limit')).not.toBeInTheDocument();
    expect(screen.getByTestId('step4-continuar')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('step4-continuar'));
    expect(onContinueToEmail).toHaveBeenCalledTimes(1);
  });
});
