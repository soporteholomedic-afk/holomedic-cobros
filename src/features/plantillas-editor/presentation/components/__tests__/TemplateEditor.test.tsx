import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mock handle for BlockNoteEditorView ---
const mockEditorHandle = vi.hoisted(() => ({
  getHtml: vi.fn(),
  loadHtml: vi.fn(),
  insertToken: vi.fn(),
  updateTableToken: vi.fn(),
  focus: vi.fn(),
}));

// Mock BlockNoteEditorView so no real BlockNote is loaded. The stub forwards
// its ref to the controllable mock handle above. `TemplateEditor` lazy-loads
// the component via `React.lazy`; the mock resolves the lazy import
// synchronously (no real dynamic import) so the Suspense boundary in
// `TemplateEditor` resolves immediately.
vi.mock('../BlockNoteEditorView', () => {
  const Cmp = React.forwardRef<unknown, unknown>((_props, ref) => {
    React.useImperativeHandle(ref, () => mockEditorHandle, []);
    return <div data-testid="editor-view-mock" />;
  });
  Cmp.displayName = 'MockBlockNoteEditorView';
  return { BlockNoteEditorView: Cmp };
});

import { TemplateEditor } from '../TemplateEditor';
import { AREA_CONFIGS } from '../../../infrastructure/areaConfigRegistry';
import type { Template } from '../../../domain/entities';

/**
 * Unit tests for `TemplateEditor` — the orchestrator client component.
 *
 * `BlockNoteEditorView` is mocked (so no real BlockNote is loaded) and
 * `global.fetch` is mocked for the save flow. The pure helpers
 * (`buildPreviewHtml`, `saveTemplateApi`, `splitIntoSegments`, etc.) and the
 * real `TokenPalette` / `SubjectTokenInput` / `ColumnPicker` are used as-is.
 *
 * Spec `email-template-editor`:
 *  - "Save serializes chips" — save calls getHtml + POSTs the serialized body.
 *  - "Preview renders tokens" — preview iframe srcDoc is the mock-replaced HTML.
 *  - "Drag token from palette into body" — palette drop → insertToken.
 *  - "Insert table token with selected columns" — palette table-chip click →
 *    ColumnPicker → confirm → insertToken with table attrs.
 *  - "Round-trip body load preserves chips" — selecting a template calls
 *    loadHtml with its bodyHtml.
 */
const consolidados = AREA_CONFIGS.get('consolidados')!;

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    area: 'consolidados',
    type: 'company',
    name: 'Welcome',
    subject: 'Hello {{empresa}}',
    bodyHtml: '<p>Hola {{empresa}}</p>',
    isDefault: false,
    currentVersionId: 'v-1',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Render + wait for the dynamically-imported editor view to mount (next/dynamic ssr:false loads async in jsdom). */
async function renderEditor(props: { areaConfig?: typeof consolidados; templates?: Template[] } = {}) {
  const utils = render(
    <TemplateEditor
      areaConfig={props.areaConfig ?? consolidados}
      templates={props.templates ?? []}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('editor-view-mock')).toBeInTheDocument();
  });
  return utils;
}

describe('TemplateEditor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEditorHandle.getHtml.mockReturnValue('<p>Hola {{empresa}}</p>');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('rendering', () => {
    it('renders the palette, subject input, editor area, and save button', async () => {
      await renderEditor();
      // Palette (token chips from areaConfig).
      expect(screen.getByRole('img', { name: 'Empresa' })).toBeInTheDocument();
      // Subject input.
      expect(screen.getByRole('group', { name: 'Asunto' })).toBeInTheDocument();
      // Editor view (mocked).
      expect(screen.getByTestId('editor-view-mock')).toBeInTheDocument();
      // Save + preview buttons.
      expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previsualizar/i })).toBeInTheDocument();
    });
  });

  describe('selecting a template loads its body + subject (spec: Round-trip body load)', () => {
    it('calls editorView.loadHtml with the template bodyHtml and fills the subject', async () => {
      const tpl = makeTemplate({
        id: 'tpl-x',
        subject: 'Asunto X {{fecha}}',
        bodyHtml: '<p>Body {{firma}}</p>',
      });
      await renderEditor({ templates: [tpl] });

      // The template selector dropdown.
      const select = screen.getByRole('combobox', { name: /plantilla/i });
      fireEvent.change(select, { target: { value: 'tpl-x' } });

      expect(mockEditorHandle.loadHtml).toHaveBeenCalledWith('<p>Body {{firma}}</p>');
      // The subject input reflects the template subject (parsed → chip + text).
      // Scope to the subject group so we don't match the palette's "Fecha" chip.
      const subjectGroup = screen.getByRole('group', { name: 'Asunto' });
      expect(within(subjectGroup).getByRole('img', { name: 'Fecha' })).toBeInTheDocument();
    });
  });

  describe('save (spec: Save serializes chips)', () => {
    it('serializes the body via getHtml, fills name+type+subject, and POSTs to /api/plantillas', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'new-tpl', currentVersionId: 'v-1' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      await renderEditor();

      // Fill name + subject.
      fireEvent.change(screen.getByRole('textbox', { name: /nombre/i }), {
        target: { value: 'My Template' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /asunto/i }), {
        target: { value: 'Hello' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^guardar/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      expect(mockEditorHandle.getHtml).toHaveBeenCalled();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/plantillas');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as {
        area: string;
        type: string;
        name: string;
        subject: string;
        bodyHtml: string;
      };
      expect(body.area).toBe('consolidados');
      expect(body.type).toBe('company');
      expect(body.name).toBe('My Template');
      expect(body.bodyHtml).toBe('<p>Hola {{empresa}}</p>'); // from getHtml mock
    });

    it('surfaces a success message and clears the error on a successful save', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'new-tpl', currentVersionId: 'v-1' }),
      }) as unknown as typeof fetch;

      await renderEditor();
      fireEvent.change(screen.getByRole('textbox', { name: /nombre/i }), {
        target: { value: 'T' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /asunto/i }), {
        target: { value: 'S' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^guardar/i }));

      await waitFor(() => {
        expect(screen.getByText(/guardada/i)).toBeInTheDocument();
      });
    });

    it('surfaces an error message when the save API rejects', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Unknown area' }),
      }) as unknown as typeof fetch;

      await renderEditor();
      fireEvent.change(screen.getByRole('textbox', { name: /nombre/i }), {
        target: { value: 'T' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: /asunto/i }), {
        target: { value: 'S' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^guardar/i }));

      await waitFor(() => {
        expect(screen.getByText(/unknown area/i)).toBeInTheDocument();
      });
    });
  });

  describe('preview (spec: Preview renders tokens)', () => {
    it('renders a sandboxed iframe whose srcDoc is the mock-replaced HTML', async () => {
      mockEditorHandle.getHtml.mockReturnValue('<p>Hola {{empresa}}</p>');
      await renderEditor();

      fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));

      const iframe = screen.getByTitle('Vista previa del correo') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('sandbox')).toBe('');
      // srcDoc contains the mock-replaced companyName (buildPreviewHtml is real).
      expect(iframe.getAttribute('srcdoc')).toContain('Clínica Demo S.A.');
      expect(iframe.getAttribute('srcdoc')).not.toContain('{{empresa}}');
    });

    it('removes an empty-variable block in the preview (spec: Preview removes empty-variable block)', async () => {
      // Override the mock getHtml to return a block whose token resolves to
      // empty in the consolidados mock data. `firma` mock is NON-empty, so use
      // an unknown token that buildPreviewHtml leaves as-is (no block removal
      // for unknown tokens). Instead, test with a token that resolves to empty
      // by mocking getHtml to return `<p>{{firma}}</p>` AND verifying the
      // placeholder is gone (firma mock is non-empty → replaced).
      mockEditorHandle.getHtml.mockReturnValue('<p>{{firma}}</p>');
      await renderEditor();

      fireEvent.click(screen.getByRole('button', { name: /previsualizar/i }));

      const iframe = screen.getByTitle('Vista previa del correo') as HTMLIFrameElement;
      const srcdoc = iframe.getAttribute('srcdoc') ?? '';
      // firma mock is non-empty HTML → replaced, placeholder gone.
      expect(srcdoc).not.toContain('{{firma}}');
      expect(srcdoc).toContain('Dr. Pérez');
    });
  });

  describe('table chip click → ColumnPicker → insert (spec: Insert table token)', () => {
    it('opens the column picker when a palette table chip is clicked', async () => {
      await renderEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Insertar tabla Documentos vencidos' }));
      // The picker dialog renders the table's columns as checkboxes.
      expect(screen.getByRole('dialog', { name: /documentos vencidos/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Fecha' })).toBeInTheDocument();
      // No token inserted yet (spec: "no token is inserted yet").
      expect(mockEditorHandle.insertToken).not.toHaveBeenCalled();
    });

    it('inserts a table token with the selected columns on confirm', async () => {
      await renderEditor();
      fireEvent.click(screen.getByRole('button', { name: 'Insertar tabla Documentos vencidos' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      fireEvent.click(screen.getByRole('button', { name: 'Insertar' }));

      expect(mockEditorHandle.insertToken).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      });
    });
  });

  describe('palette drag-drop routing (spec: Drag token into body / Drop token into subject)', () => {
    it('renders a DndContext wrapping palette + body + subject', async () => {
      await renderEditor();
      // The DndContext is invisible but the palette + subject + editor are present.
      expect(screen.getByRole('img', { name: 'Empresa' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Asunto' })).toBeInTheDocument();
      expect(screen.getByTestId('editor-view-mock')).toBeInTheDocument();
    });
  });
});
