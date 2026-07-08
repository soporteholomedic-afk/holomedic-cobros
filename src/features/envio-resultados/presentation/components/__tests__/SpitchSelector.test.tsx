/**
 * Tests for the rewired `SpitchSelector` (PR 4 — Task 4.5).
 *
 * Spec delta `envio-resultados` MODIFIED:
 *  - "SpitchSelector empty-state UX" + sub-scenarios
 *    - "Empty state shows link to editor"
 *    - "Error state shows retry"
 *    - "Populated state selects first"
 *  - MODIFIED "SpitchSelector template source":
 *    - "Selector no longer instantiates a repo"
 *
 * The test mocks the `useSpitches` hook at the module boundary (the
 * ONLY mock it needs — the old test mocked the use case and the
 * MockSpitchRepo, both of which are deleted by PR 4).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SpitchSelector } from '../SpitchSelector';
import type { SpitchDTO, SpitchType } from '../../../../domain/entities';

const SAMPLE_SPITCHES: SpitchDTO[] = [
  {
    id: 'tpl-001',
    area: 'consolidados',
    type: 'company',
    name: 'Resumen general de resultados',
    subject: 'Informe consolidado — test',
    bodyHtml: '<p>Test company body</p>',
  },
  {
    id: 'tpl-002',
    area: 'consolidados',
    type: 'company',
    name: 'Resultados por paciente — detallado',
    subject: 'Resultados detallados — test',
    bodyHtml: '<p>Test detailed body</p>',
  },
];

const SAMPLE_PATIENT_SPITCHES: SpitchDTO[] = [
  {
    id: 'tpl-003',
    area: 'consolidados',
    type: 'patient',
    name: 'Notificación personal de resultados',
    subject: 'Resultados de sus exámenes — test',
    bodyHtml: '<p>Test patient body</p>',
  },
];

// ---- Mock the hook at the module boundary (the only mock) ----
const useSpitchesMock = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useSpitches', () => ({
  useSpitches: useSpitchesMock,
}));

function setHookReturn(value: ReturnType<typeof useSpitchesMock>) {
  useSpitchesMock.mockReturnValue(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: loading. Tests override per case.
  setHookReturn({ spitches: [], status: 'loading', error: null, retry: vi.fn() });
});

describe('SpitchSelector (PR 4 — useSpitches rewired)', () => {
  describe('loading state', () => {
    it('shows "Cargando..." while the hook reports status="loading"', () => {
      setHookReturn({ spitches: [], status: 'loading', error: null, retry: vi.fn() });
      render(<SpitchSelector target="company" onSelect={() => {}} area="consolidados" />);
      expect(screen.getByText('Cargando...')).toBeInTheDocument();
    });

    it('does NOT call onSelect while loading (no auto-select from a populated state)', () => {
      const onSelect = vi.fn();
      setHookReturn({ spitches: [], status: 'loading', error: null, retry: vi.fn() });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('populated state (spec: Populated state selects first)', () => {
    it('renders a <select> with the spitches and auto-selects the first', async () => {
      const onSelect = vi.fn();
      setHookReturn({
        spitches: SAMPLE_SPITCHES,
        status: 'populated',
        error: null,
        retry: vi.fn(),
      });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);

      await waitFor(() => {
        expect(screen.getByText('Resumen general de resultados')).toBeInTheDocument();
      });
      expect(screen.getByText('Resultados por paciente — detallado')).toBeInTheDocument();
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      // Auto-select the first spitch.
      expect(select.value).toBe('tpl-001');
    });

    it('auto-selects the option matching the selectedId prop when provided', async () => {
      setHookReturn({
        spitches: SAMPLE_SPITCHES,
        status: 'populated',
        error: null,
        retry: vi.fn(),
      });
      render(
        <SpitchSelector
          target="company"
          onSelect={() => {}}
          selectedId="tpl-002"
          area="consolidados"
        />,
      );
      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('tpl-002');
      });
    });

    it('calls onSelect exactly once on initial auto-select (no double-fire)', async () => {
      const onSelect = vi.fn();
      setHookReturn({
        spitches: SAMPLE_SPITCHES,
        status: 'populated',
        error: null,
        retry: vi.fn(),
      });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      await waitFor(() => {
        expect(screen.getByText('Resumen general de resultados')).toBeInTheDocument();
      });
      // Auto-selected once with the first spitch.
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(SAMPLE_SPITCHES[0]);
    });

    it('forwards the chosen spitch to onSelect when the user changes the selection', async () => {
      const onSelect = vi.fn();
      setHookReturn({
        spitches: SAMPLE_SPITCHES,
        status: 'populated',
        error: null,
        retry: vi.fn(),
      });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      await waitFor(() => {
        expect(screen.getByText('Resultados por paciente — detallado')).toBeInTheDocument();
      });
      onSelect.mockClear();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tpl-002' } });
      expect(onSelect).toHaveBeenCalledWith(SAMPLE_SPITCHES[1]);
    });
  });

  describe('empty state (spec: Empty state shows link to editor)', () => {
    it('shows the empty message and a "Crear plantilla" link to the editor for the area', () => {
      const onSelect = vi.fn();
      setHookReturn({ spitches: [], status: 'empty', error: null, retry: vi.fn() });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      expect(screen.getByText('No hay plantillas para esta área')).toBeInTheDocument();
      const link = screen.getByRole('link', { name: /crear plantilla/i });
      expect(link).toHaveAttribute('href', '/admin/plantillas/consolidados');
    });

    it('does NOT call onSelect in the empty state (no auto-select)', () => {
      const onSelect = vi.fn();
      setHookReturn({ spitches: [], status: 'empty', error: null, retry: vi.fn() });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('derives the editor link from the area prop', () => {
      setHookReturn({ spitches: [], status: 'empty', error: null, retry: vi.fn() });
      render(<SpitchSelector target="company" onSelect={() => {}} area="consolidados" />);
      // Generic matcher — the link target is `/admin/plantillas/<area>`.
      const link = screen.getByRole('link', { name: /crear plantilla/i });
      expect(link.getAttribute('href')).toMatch(/^\/admin\/plantillas\/consolidados$/);
    });
  });

  describe('error state (spec: Error state shows retry)', () => {
    it('shows the error message and a "Reintentar" button', () => {
      const onSelect = vi.fn();
      setHookReturn({
        spitches: [],
        status: 'error',
        error: 'HTTP 500',
        retry: vi.fn(),
      });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      expect(screen.getByText('No se pudieron cargar las plantillas')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });

    it('invokes the hook retry function when the user clicks the retry button', () => {
      const retry = vi.fn();
      setHookReturn({ spitches: [], status: 'error', error: 'Boom', retry });
      render(<SpitchSelector target="company" onSelect={() => {}} area="consolidados" />);
      fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onSelect in the error state', () => {
      const onSelect = vi.fn();
      setHookReturn({
        spitches: [],
        status: 'error',
        error: 'Boom',
        retry: vi.fn(),
      });
      render(<SpitchSelector target="company" onSelect={onSelect} area="consolidados" />);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('area / type wiring', () => {
    it('passes area and type to useSpitches', () => {
      setHookReturn({ spitches: [], status: 'loading', error: null, retry: vi.fn() });
      render(<SpitchSelector target="patient" onSelect={() => {}} area="consolidados" />);
      expect(useSpitchesMock).toHaveBeenCalledWith('consolidados', 'patient');
    });

    it('renders patient spitches when target is "patient"', async () => {
      setHookReturn({
        spitches: SAMPLE_PATIENT_SPITCHES,
        status: 'populated',
        error: null,
        retry: vi.fn(),
      });
      render(<SpitchSelector target="patient" onSelect={() => {}} area="consolidados" />);
      await waitFor(() => {
        expect(screen.getByText('Notificación personal de resultados')).toBeInTheDocument();
      });
    });
  });
});

describe('SpitchSelector — module-level instantiation removed (spec: Selector no longer instantiates a repo)', () => {
  it('does not import or instantiate any repository / use case at module scope', async () => {
    // Source-level assertion: the new component file MUST NOT
    // contain any module-top `new MockSpitchRepo()` /
    // `new GetSptichesUseCase(...)` / repo-instantiation pattern.
    // AGENTS.md requires this — and the spec scenario
    // "Selector no longer instantiates a repo" pins it.
    //
    // The assertion targets instantiation / import patterns (not just
    // any textual mention — comments may reference the old types as
    // migration notes). A future regression that re-introduces the
    // module-top instantiation is caught here.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(
      path.resolve(__dirname, '..', '..', 'components', 'SpitchSelector.tsx'),
      'utf8',
    );
    // No `new MockSpitchRepo()` anywhere in the module.
    expect(src).not.toMatch(/new\s+MockSpitchRepo\b/);
    // No `new GetSptichesUseCase(...)` anywhere in the module.
    expect(src).not.toMatch(/new\s+GetSptichesUseCase\b/);
    // No `import` of the old use case or the mock repository (anywhere
    // in the file — server, client, top of file, or inside the body).
    expect(src).not.toMatch(/from\s+['"].*application\/getSptiches['"]/);
    expect(src).not.toMatch(/from\s+['"].*infrastructure\/mock\/spitchRepo['"]/);
    expect(src).not.toMatch(/from\s+['"].*domain\/ports['"]/);
  });
});
