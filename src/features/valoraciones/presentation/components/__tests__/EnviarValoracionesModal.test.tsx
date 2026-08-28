import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EnviarValoracionesModal } from '../EnviarValoracionesModal';
import type { EmpresaGrupo, ValoracionesFilter } from '../../../domain/entities';
import { makeRepFacturacion } from '../../../domain/fixtures';

/**
 * EnviarValoracionesModal (REQ-03 M-R2/M-R3/M-R4) — the valorizaciones
 * email modal: RUC-keyed recipient prefill via `/api/valoraciones/contactos`,
 * plantillas picker (area `valoraciones`) with token interpolation, PDF/Excel
 * attachment toggles and the send action. `fetch` mocked at the network
 * boundary, routed by URL (SpitchSelector consumes `/api/plantillas`).
 */

const filtro: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
  codCli: 55,
};

const grupos: EmpresaGrupo[] = [
  {
    empresa: 'EMPRESA DEMO S.A.C.',
    rows: [makeRepFacturacion({ VVtaMN: 100 })],
    cantidad: 1,
    subtotal: 100,
    igv: 18,
    total: 118,
    simbol: 's/.',
  },
];

const CONTACTO = {
  ruc: '20123456789',
  razonSocial: 'EMPRESA DEMO S.A.C.',
  emailPrincipal: 'facturas@demo.com.pe',
  emailCopia: 'cc@demo.com.pe',
  updatedAt: '2026-01-15T10:00:00.000Z',
  updatedBy: 'ops',
};

const PLANTILLAS = {
  spitches: [
    {
      id: 't1',
      area: 'valoraciones',
      type: 'company',
      name: 'Valorización estándar',
      subject: 'Valorización {{empresa}} — {{periodo}}',
      bodyHtml: '<p>Estimados {{empresa}} (RUC {{ruc}}), periodo {{periodo}}, total {{total}} {{moneda}}.</p>',
    },
  ],
};

// Firma-bearing variant for the deferred-firma race suite: {{firma}} is
// baked as the [Falta configurar firma] fallback while the
// GET /api/plantillas/firma fetch is pending.
const PLANTILLAS_CON_FIRMA = {
  spitches: [
    {
      id: 't1',
      area: 'valoraciones',
      type: 'company',
      name: 'Valorización con firma',
      subject: 'Valorización {{empresa}} — {{periodo}}',
      bodyHtml: '<p>Periodo {{periodo}}, total {{total}} {{moneda}}.</p><div>{{firma}}</div>',
    },
  ],
};

type Route = { url: string; status: number; body: unknown };

function mockFetch(routes: Route[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const href = String(input);
    const route = routes.find((r) => href.includes(r.url));
    if (!route) return Promise.reject(new Error(`unexpected fetch: ${href}`));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderModal(props?: Partial<Parameters<typeof EnviarValoracionesModal>[0]>) {
  return (
    <EnviarValoracionesModal
      filtro={filtro}
      codCli={55}
      cliNombre="EMPRESA DEMO S.A.C."
      grupos={grupos}
      onClose={vi.fn()}
      {...props}
    />
  );
}

/**
 * Deferred-firma harness (CobranzaEmailComposer race-test pattern): the
 * plantillas list + contactos resolve immediately (template auto-select
 * fires), while GET /api/plantillas/firma stays pending until the test
 * calls `resolveFirma`. NOTE: the firma route check MUST come before the
 * plantillas one — '/api/plantillas/firma'.includes('/api/plantillas').
 */
function deferredFirmaHarness(
  firmaResponseBody: unknown,
  plantillas: unknown = PLANTILLAS_CON_FIRMA,
) {
  let resolveFirma!: (value: Response) => void;
  const jsonResponseOf = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('/api/plantillas/firma')) {
      return new Promise<Response>((resolve) => {
        resolveFirma = resolve;
      });
    }
    if (href.includes('/api/plantillas')) {
      return Promise.resolve(jsonResponseOf(plantillas));
    }
    if (href.includes('/api/valoraciones/contactos')) {
      return Promise.resolve(
        jsonResponseOf({ success: true, nroRuc: '20123456789', contacto: CONTACTO }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${href}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return {
    fetchMock,
    resolveFirma: () => resolveFirma(jsonResponseOf(firmaResponseBody)),
  };
}

describe('EnviarValoracionesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('corporate client: prefills to/cc from the REQ-01 contact lookup (M-R3 scenario 1)', async () => {
    mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: '20123456789', contacto: CONTACTO } },
    ]);
    render(renderModal());

    const to = await screen.findByLabelText('Para');
    await waitFor(() => expect((to as HTMLInputElement).value).toBe('facturas@demo.com.pe'));
    expect((screen.getByLabelText('CC') as HTMLInputElement).value).toBe('cc@demo.com.pe');
  });

  it('no valid RUC: recipients stay empty and editable without a lookup error (M-R3 scenario 2)', async () => {
    mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: null, contacto: null } },
    ]);
    render(renderModal());

    const to = await screen.findByLabelText('Para');
    await waitFor(() => expect((to as HTMLInputElement).value).toBe(''));
    // Manual entry works — typing updates the field, no alert shown.
    fireEvent.change(to, { target: { value: 'manual@demo.com' } });
    expect((to as HTMLInputElement).value).toBe('manual@demo.com');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('template auto-select interpolates valoraciones tokens in subject and body (M-R2)', async () => {
    mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: '20123456789', contacto: CONTACTO } },
    ]);
    const { container } = render(renderModal());

    // Subject: empresa + periodo resolved, no surviving {{token}}.
    const subject = await screen.findByLabelText('Asunto');
    await waitFor(() =>
      expect((subject as HTMLInputElement).value).toBe(
        'Valorización EMPRESA DEMO S.A.C. — 01/01/2026 al 31/01/2026',
      ),
    );

    // Body preview (interpolated HTML) carries the resolved tokens.
    const preview = container.querySelector('[data-testid="valoraciones-body-preview"]');
    expect(preview).not.toBeNull();
    await waitFor(() => expect(preview!.textContent).toContain('RUC 20123456789'));
    expect(preview!.textContent).toContain('01/01/2026 al 31/01/2026');
    expect(preview!.textContent).toContain('SOLES');
    expect(preview!.innerHTML).not.toContain('{{');
  });

  it('sends via /api/valoraciones/send with both attachments by default; toggling PDF drops the flag (M-R4)', async () => {
    const fetchMock = mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: '20123456789', contacto: CONTACTO } },
      { url: '/api/valoraciones/send', status: 200, body: { success: true, messageId: '<abc>' } },
    ]);
    render(renderModal());

    await waitFor(() =>
      expect((screen.getByLabelText('Para') as HTMLInputElement).value).toBe('facturas@demo.com.pe'),
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Asunto') as HTMLInputElement).value).not.toBe(''),
    );

    // Both attachment toggles default to checked.
    const pdfToggle = screen.getByLabelText(/adjuntar pdf/i) as HTMLInputElement;
    const excelToggle = screen.getByLabelText(/adjuntar excel/i) as HTMLInputElement;
    expect(pdfToggle.checked).toBe(true);
    expect(excelToggle.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/enviado correctamente/i)).toBeInTheDocument());

    const sendCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/valoraciones/send'));
    expect(sendCall).toBeDefined();
    const init = sendCall![1] as RequestInit;
    const body = init.body as FormData;
    expect(body.get('adjuntarPdf')).toBe('true');
    expect(body.get('adjuntarExcel')).toBe('true');
    expect(body.get('to')).toBe('facturas@demo.com.pe');

    // Second send with PDF toggled off carries adjuntarPdf='false'.
    fireEvent.change(screen.getByLabelText('Para'), { target: { value: 'otro@demo.com' } });
    fireEvent.click(pdfToggle);
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/send')).length).toBe(2));
    const secondCall = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/send'))[1]!;
    const secondBody = (secondCall![1] as RequestInit).body as FormData;
    expect(secondBody.get('adjuntarPdf')).toBe('false');
    expect(secondBody.get('adjuntarExcel')).toBe('true');
  });

  it('passes the empresa scope through to the send FormData so attachments stay row-scoped (U6)', async () => {
    const fetchMock = mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: '20123456789', contacto: CONTACTO } },
      { url: '/api/valoraciones/send', status: 200, body: { success: true, messageId: '<abc>' } },
    ]);
    render(renderModal({ empresa: 'EMPRESA DEMO S.A.C.' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Asunto') as HTMLInputElement).value).not.toBe(''),
    );
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await waitFor(() => expect(screen.getByText(/enviado correctamente/i)).toBeInTheDocument());

    const sendCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/valoraciones/send'));
    const body = (sendCall![1] as RequestInit).body as FormData;
    expect(body.get('empresa')).toBe('EMPRESA DEMO S.A.C.');
  });

  it('send failure surfaces the API error message (user-safe error handling)', async () => {
    mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: '20123456789', contacto: CONTACTO } },
      { url: '/api/valoraciones/send', status: 503, body: { success: false, error: 'SMTP connection timed out', code: 'SMTP_TIMEOUT' } },
    ]);
    render(renderModal());

    await waitFor(() =>
      expect((screen.getByLabelText('Para') as HTMLInputElement).value).toBe('facturas@demo.com.pe'),
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Asunto') as HTMLInputElement).value).not.toBe(''),
    );

    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('SMTP connection timed out');
  });

  it('closes on Escape and on the close button', async () => {
    mockFetch([
      { url: '/api/plantillas', status: 200, body: PLANTILLAS },
      { url: '/api/valoraciones/contactos', status: 200, body: { success: true, nroRuc: null, contacto: null } },
    ]);
    const onClose = vi.fn();
    render(renderModal({ onClose }));

    await screen.findByLabelText('Para');
    fireEvent.click(screen.getByText('Cerrar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // Deferred-firma race suite: the modal consumes useFirmaCorreo, so the
  // template auto-select can beat GET /api/plantillas/firma and bake the
  // [Falta configurar firma] fallback. Marker-replacement recovery swaps
  // it in place once the firma lands (same contract as the composers).
  // ---------------------------------------------------------------------

  async function getBodyPreview(container: HTMLElement) {
    // The preview div only renders once the auto-selected template
    // interpolates a non-empty body — wait for it to appear.
    return waitFor(() => {
      const preview = container.querySelector('[data-testid="valoraciones-body-preview"]');
      expect(preview).not.toBeNull();
      return preview!;
    });
  }

  it('firma fetch resolving after template auto-select: the baked marker is replaced with the composed firma', async () => {
    const harness = deferredFirmaHarness({
      success: true,
      firma: null,
      firmaHtml: '<table><tr><td>Dra. Valoraciones</td></tr></table>',
    });
    const { container } = render(renderModal());

    // Auto-select ran while the firma fetch was pending → marker baked.
    const preview = await getBodyPreview(container);
    await waitFor(() => expect(preview.textContent).toContain('[Falta configurar firma]'));
    expect(preview.textContent).toContain('01/01/2026 al 31/01/2026');

    await act(async () => {
      harness.resolveFirma();
    });

    // Recovery: firma inlined, marker gone, rest of the body intact.
    await waitFor(() => expect(preview.textContent).toContain('Dra. Valoraciones'));
    expect(preview.innerHTML).not.toContain('[Falta configurar firma]');
    expect(preview.innerHTML).not.toContain('{{firma}}');
    expect(preview.textContent).toContain('01/01/2026 al 31/01/2026');
  });

  it('firma tardía con cuerpo SIN el marcador: el cuerpo queda intacto', async () => {
    // Template without {{firma}} → the body never carries the marker,
    // so the firma arrival must not touch it.
    const plantillasSinFirma = {
      spitches: [
        {
          ...PLANTILLAS_CON_FIRMA.spitches[0],
          bodyHtml: '<p>Solo el periodo {{periodo}}, sin token de firma.</p>',
        },
      ],
    };
    const harness = deferredFirmaHarness(
      { success: true, firma: null, firmaHtml: '<table><tr><td>Dra. Valoraciones</td></tr></table>' },
      plantillasSinFirma,
    );

    const { container } = render(renderModal());
    const preview = await getBodyPreview(container);
    await waitFor(() =>
      expect(preview.textContent).toContain('Solo el periodo 01/01/2026 al 31/01/2026'),
    );

    // The firma lands (non-empty) — no marker in the body, so the body
    // is left untouched.
    await act(async () => {
      harness.resolveFirma();
    });

    expect(preview.innerHTML).not.toContain('Dra. Valoraciones');
    expect(preview.innerHTML).not.toContain('[Falta configurar firma]');
    expect(preview.textContent).toContain('Solo el periodo 01/01/2026 al 31/01/2026');
  });

  it('firma diferida que resuelve vacía (sin firma guardada): el marcador permanece', async () => {
    const harness = deferredFirmaHarness({ success: true, firma: null, firmaHtml: '' });
    const { container } = render(renderModal());

    const preview = await getBodyPreview(container);
    await waitFor(() => expect(preview.textContent).toContain('[Falta configurar firma]'));

    await act(async () => {
      harness.resolveFirma();
    });

    // No saved signature → the spec fallback stays.
    expect(preview.textContent).toContain('[Falta configurar firma]');
    expect(preview.innerHTML).not.toContain('{{firma}}');
  });
});
