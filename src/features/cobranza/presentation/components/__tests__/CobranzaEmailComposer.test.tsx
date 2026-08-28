/**
 * CobranzaEmailComposer behavioral suite (envio-correos-facturacion
 * Unit 2, tasks 2.2/2.3) — ports the EmailComposerModal cases (guards,
 * confirm, retry, directory persist, success animation) onto the shared
 * two-panel module, and pins the NEW spec behaviors: the server-composed
 * signature interpolated inline at {{firma}} (editor-firmas PR4),
 * local attachments dispatched as repeated FormData parts, and the ≤10
 * recipients guard (cobranza-envio MODIFIED scenarios).
 *
 * Mocks: SpitchSelector at the module boundary; the lazy BlockNote
 * editor stubbed (module behavior covered in Unit 1); fetch routed
 * per-endpoint so call ORDER and payloads are assertable.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CobranzaEmailComposer } from '../CobranzaEmailComposer';
import { mockClients } from '@/utils/__tests__/mockData';
import type { ClienteGroup } from '@/types';

const SAMPLE_SPITCH = vi.hoisted(() => ({
  id: 'tpl-cob-1',
  area: 'cobranza',
  type: 'company',
  name: 'Recordatorio de pago',
  subject: 'Recordatorio {{empresa}} — deuda {{montoTotal}}',
  bodyHtml:
    '<p>Estimados {{empresa}},</p>' +
    '<p>RUC {{ruc}} — saldo {{montoTotal}} {{moneda}}, vencido {{diasVencidos}} días.</p>' +
    '{{tabla:documentosPendientes:fecha,factura,monto,saldo}}' +
    '<div>{{cuentasBancarias}}</div>' +
    '<div>{{firma}}</div>',
}));

vi.mock('@/features/envio-resultados/presentation/components/SpitchSelector', () => ({
  SpitchSelector: (props: {
    area: string;
    target: string;
    onSelect: (spitch: unknown) => void;
  }) => (
    <div data-testid="spitch-selector-mock" data-area={props.area} data-target={props.target}>
      <button
        type="button"
        data-testid="spitch-mock-select"
        onClick={() => props.onSelect(SAMPLE_SPITCH)}
      >
        Seleccionar plantilla de prueba
      </button>
    </div>
  ),
}));

vi.mock('@/components/email/EmailBodyEditor', () => ({
  EmailBodyEditor: React.forwardRef(function EmailBodyEditor() {
    return <div data-testid="email-body-editor" />;
  }),
}));

// ---------------------------------------------------------------------------
// Fetch router (GET/PUT contactos, POST send-email)
// ---------------------------------------------------------------------------

interface RouteResponse {
  body?: unknown;
  ok?: boolean;
  status?: number;
}

const STORED_CONTACT = {
  ruc: '20601234567',
  razonSocial: 'HOLOMEDIC S.A.C.',
  emailPrincipal: 'contacto@empresa.com',
  emailCopia: 'gerencia@empresa.com',
  updatedAt: '2026-08-01T10:00:00.000Z',
  updatedBy: 'María Pérez',
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

interface RouterOptions {
  get?: RouteResponse;
  put?: RouteResponse;
  /** GET /api/plantillas/firma (own composed signature, editor-firmas PR4). */
  firma?: RouteResponse;
  /** Sequenced POST outcomes; the last one repeats. */
  postResults?: RouteResponse[];
  /** POST never settles (spinner test). */
  postPending?: boolean;
  /** POST rejects (network error test). */
  postRejects?: boolean;
}

const COMPOSED_FIRMA = '<table><tr><td>Dra. Firma Guardada</td></tr></table>';

function stubFetchRouter(options: RouterOptions = {}) {
  const get = options.get ?? { body: { success: true, contacto: null } };
  const put = options.put ?? { body: { success: true, contacto: STORED_CONTACT } };
  const firma = options.firma ?? {
    body: { success: true, firma: null, firmaHtml: '' },
  };
  const postResults = options.postResults ?? [{ body: { success: true } }];
  let postCall = 0;

  const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/plantillas/firma') {
      return Promise.resolve(jsonResponse(firma.body, firma.ok, firma.status));
    }
    if (url.startsWith('/api/cobranza/contactos')) {
      if (method === 'PUT') {
        return Promise.resolve(jsonResponse(put.body, put.ok, put.status));
      }
      return Promise.resolve(jsonResponse(get.body, get.ok, get.status));
    }
    if (url === '/api/send-email') {
      if (options.postPending) return new Promise(() => {});
      if (options.postRejects) return Promise.reject(new Error('Failed to fetch'));
      const route = postResults[Math.min(postCall, postResults.length - 1)];
      postCall += 1;
      return Promise.resolve(jsonResponse(route.body, route.ok, route.status));
    }
    return Promise.reject(new Error(`Unexpected fetch in test: ${method} ${url}`));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type FetchRouter = ReturnType<typeof stubFetchRouter>;

function callsTo(fetchMock: FetchRouter, prefix: string, method: string): number[] {
  return fetchMock.mock.calls
    .map(([url, init], index) => ({
      index,
      url: String(url),
      method: init?.method ?? 'GET',
    }))
    .filter((c) => c.url.startsWith(prefix) && c.method === method)
    .map((c) => c.index);
}

function postFormOf(fetchMock: FetchRouter, index: number): FormData {
  return fetchMock.mock.calls[index]?.[1]?.body as FormData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JUNK_CLIENT: ClienteGroup = { ...mockClients[0], razonSocial: 'CLIENTE SIN NOMBRE' };

function renderComposer(client: ClienteGroup = mockClients[0]) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(<CobranzaEmailComposer client={client} onClose={onClose} onSuccess={onSuccess} />);
  return { onClose, onSuccess };
}

function getToField() {
  return screen.getByLabelText('Destinatario');
}

function getCcField() {
  return screen.getByLabelText('CC');
}

function getPreviewHtml() {
  return screen.getByTestId('email-preview').innerHTML;
}

function selectTemplate() {
  fireEvent.click(screen.getByTestId('spitch-mock-select'));
}

function fillTo(value: string) {
  fireEvent.change(getToField(), { target: { value } });
}

function getSendButton() {
  return screen.getByRole('button', { name: /^Enviar$/ });
}

function submitAndConfirm() {
  fireEvent.click(getSendButton());
  fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));
}

function dropFiles(files: File[]) {
  fireEvent.drop(screen.getByTestId('local-file-drop-zone'), {
    dataTransfer: { files },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CobranzaEmailComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- DIR-03: prefill ----

  it('deja los campos vacíos cuando no hay contacto guardado (sin correo inventado)', () => {
    stubFetchRouter(); // GET → contacto: null

    renderComposer();

    expect(getToField()).toHaveValue('');
    expect(getCcField()).toHaveValue('');
    expect(document.body.textContent).not.toMatch(/administracion@/);
  });

  it('pre-puebla to/cc desde el contacto guardado por RUC', async () => {
    stubFetchRouter({ get: { body: { success: true, contacto: STORED_CONTACT } } });

    renderComposer();

    await waitFor(() => {
      expect(getToField()).toHaveValue('contacto@empresa.com');
    });
    expect(getCcField()).toHaveValue('gerencia@empresa.com');
  });

  it('clave basura (CLIENTE SIN NOMBRE): no hace GET y los campos quedan vacíos', () => {
    const fetchMock = stubFetchRouter();

    renderComposer(JUNK_CLIENT);

    expect(getToField()).toHaveValue('');
    expect(getCcField()).toHaveValue('');
    expect(callsTo(fetchMock, '/api/cobranza/contactos', 'GET')).toHaveLength(0);
  });

  it('GET falla: el compositor sigue operativo con campos vacíos (degradación elegante)', () => {
    stubFetchRouter({
      get: { body: { success: false, error: 'INTERNAL_ERROR' }, ok: false, status: 500 },
    });

    renderComposer();

    expect(getToField()).toHaveValue('');
    expect(getSendButton()).toBeInTheDocument();
  });

  // ---- DIR-06/D8: template flow + structured signature ----

  it('renderiza SpitchSelector para el área cobranza (target company)', () => {
    stubFetchRouter();

    renderComposer();

    const selector = screen.getByTestId('spitch-selector-mock');
    expect(selector.getAttribute('data-area')).toBe('cobranza');
    expect(selector.getAttribute('data-target')).toBe('company');
  });

  it('al seleccionar plantilla interpola en tiempo real con la firma compuesta del servidor inlined en {{firma}}', async () => {
    stubFetchRouter({
      firma: { body: { success: true, firma: null, firmaHtml: COMPOSED_FIRMA } },
    });

    renderComposer();
    // Flush microtasks so the mount-time firma GET resolves BEFORE the
    // template selection (the documented race avoidance).
    await act(async () => {});
    selectTemplate();

    const preview = getPreviewHtml();
    expect(preview).toContain('Estimados HOLOMEDIC S.A.C.');
    expect(preview).toContain('RUC 20601234567');
    expect(preview).toContain('S/ 1,000.00');
    expect(preview).toContain('FE F001-101'); // documentosPendientes table row
    expect(preview).toContain('DATOS PARA EL PAGO'); // cuentasBancarias
    // Server-composed signature inlined at {{firma}} by the resolver.
    expect(preview).toContain('Dra. Firma Guardada');
    // The legacy client-side session-seeded signature is gone.
    expect(preview).not.toContain('María Pérez');
    expect(preview).not.toContain('{{firma}}');
    expect(
      screen.getByDisplayValue('Recordatorio HOLOMEDIC S.A.C. — deuda S/ 1,000.00')
    ).toBeInTheDocument();
  });

  it('seleccionar plantilla antes de que resuelva la firma hornea el fallback hasta reseleccionar (carrera aceptada)', async () => {
    // Deferred firma fetch — the template selection beats resolution.
    let resolveFirma!: (value: Response) => void;
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/plantillas/firma') {
        return new Promise<Response>((resolve) => { resolveFirma = resolve; });
      }
      if (url.startsWith('/api/cobranza/contactos')) {
        return Promise.resolve(jsonResponse({ success: true, contacto: null }));
      }
      return Promise.reject(new Error(`Unexpected fetch in test: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComposer();
    selectTemplate();

    // Fallback placeholder baked into this interpolation.
    expect(getPreviewHtml()).toContain('[Falta configurar firma]');

    // The fetch resolves with the composed block; reselecting the
    // template re-interpolates with the real firma (recovery path).
    await act(async () => {
      resolveFirma(
        jsonResponse({ success: true, firma: null, firmaHtml: COMPOSED_FIRMA }),
      );
    });
    selectTemplate();

    expect(getPreviewHtml()).toContain('Dra. Firma Guardada');
    expect(getPreviewHtml()).not.toContain('[Falta configurar firma]');
  });

  it('sin firma guardada interpola el placeholder [Falta configurar firma] en {{firma}}', async () => {
    stubFetchRouter(); // firmaHtml: ''

    renderComposer();
    await act(async () => {});
    selectTemplate();

    expect(getPreviewHtml()).toContain('[Falta configurar firma]');
    expect(getPreviewHtml()).not.toContain('María Pérez');
    expect(getPreviewHtml()).not.toContain('{{firma}}');
    expect(screen.queryByTestId('signature-editor')).not.toBeInTheDocument();
  });

  it('despacha el html interpolado con la firma compuesta del servidor exactamente una vez (sin re-agregado del cliente)', async () => {
    const fetchMock = stubFetchRouter({
      firma: { body: { success: true, firma: null, firmaHtml: COMPOSED_FIRMA } },
    });

    renderComposer();
    await act(async () => {});
    selectTemplate();
    fillTo('cobranzas@cliente.com');

    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const dispatchedHtml = String(postFormOf(fetchMock, postIndexes[0]).get('html') ?? '');
    // Dispatched html = interpolated body with the composed firma inline
    // (exactly once) — NO client-side signature re-append remains.
    expect(dispatchedHtml.match(/Dra. Firma Guardada/g)).toHaveLength(1);
    expect(dispatchedHtml).toContain('Estimados HOLOMEDIC S.A.C.');
    expect(dispatchedHtml).not.toContain('<!--holomedic-firma-->');
    expect(dispatchedHtml).not.toContain('{{firma}}');
  });

  it('botón Enviar deshabilitado hasta seleccionar una plantilla (plantilla obligatoria)', () => {
    stubFetchRouter();

    renderComposer();
    fillTo('cobranzas@cliente.com');

    expect(getSendButton()).toBeDisabled();

    selectTemplate();

    expect(getSendButton()).not.toBeDisabled();
  });

  it('bloquea el envío con más de 10 destinatarios en el campo Para', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    const elevenEmails = Array.from({ length: 11 }, (_, i) => `dest${i}@cliente.com`).join(', ');
    fillTo(elevenEmails);

    expect(getSendButton()).toBeDisabled();
    expect(screen.getByText(/máximo 10 destinatarios/i)).toBeInTheDocument();
    // No confirm dialog can appear from a disabled send.
    expect(screen.queryByText(/¿Confirmar envío?/i)).not.toBeInTheDocument();
  });

  it('bloquea el envío sin destinatarios (campo Para vacío)', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();

    expect(getSendButton()).toBeDisabled();
    expect(screen.queryByText(/¿Confirmar envío?/i)).not.toBeInTheDocument();
  });

  // ---- Attachments (drop zone → FormData) ----

  it('muestra el drop zone de archivos locales en el panel izquierdo', () => {
    stubFetchRouter();

    renderComposer();

    expect(screen.getByTestId('local-file-drop-zone')).toBeInTheDocument();
  });

  it('limita los adjuntos locales a 10 archivos con aviso visible', () => {
    stubFetchRouter();

    renderComposer();

    const elevenFiles = Array.from({ length: 11 }, (_, i) =>
      new File([new Uint8Array(4)], `adjunto-${i}.pdf`, { type: 'application/pdf' })
    );
    dropFiles(elevenFiles);

    expect(screen.getAllByLabelText(/^Quitar /)).toHaveLength(10);
    expect(screen.getByText(/máximo 10 archivos adjuntos/i)).toBeInTheDocument();
  });

  // ---- DIR-07: persist-before-dispatch + FormData payload ----

  it('hace PUT (memorizar contacto) ANTES del POST y envía purpose cobranza vía FormData', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const putIndexes = callsTo(fetchMock, '/api/cobranza/contactos', 'PUT');
    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    expect(putIndexes).toHaveLength(1);
    expect(postIndexes).toHaveLength(1);
    // CALL ORDER: persist (PUT) strictly before send (POST).
    expect(putIndexes[0]).toBeLessThan(postIndexes[0]);

    // PUT body: first 'to' as emailPrincipal, cc joined (null when empty).
    const putCall = fetchMock.mock.calls[putIndexes[0]];
    const putBody = JSON.parse(putCall?.[1]?.body as string);
    expect(putBody).toEqual({
      ruc: '20601234567',
      razonSocial: 'HOLOMEDIC S.A.C.',
      emailPrincipal: 'cobranzas@cliente.com',
      emailCopia: null,
    });

    // POST FormData: purpose 'cobranza' + interpolated body + recipients.
    const form = postFormOf(fetchMock, postIndexes[0]);
    expect(form.get('purpose')).toBe('cobranza');
    expect(form.get('to')).toBe('cobranzas@cliente.com');
    expect(form.get('subject')).toBe('Recordatorio HOLOMEDIC S.A.C. — deuda S/ 1,000.00');
    const dispatchedHtml = String(form.get('html') ?? '');
    expect(dispatchedHtml).toContain('Estimados HOLOMEDIC S.A.C.');
    // No saved signature (default router: firmaHtml '') → the resolver's
    // fallback is inlined at {{firma}}; no client-side signature append.
    expect(dispatchedHtml).toContain('[Falta configurar firma]');
    expect(dispatchedHtml).not.toContain('María Pérez');
    expect(dispatchedHtml).not.toContain('<!--holomedic-firma-->');
    expect(dispatchedHtml).not.toContain('{{firma}}');
    expect(form.get('cc')).toBeNull();
  });

  it('envía cc en el FormData y lo memoriza como emailCopia (unido por coma)', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    fireEvent.change(getCcField(), {
      target: { value: 'gerencia@cliente.com, contabilidad@cliente.com' },
    });
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const putIndexes = callsTo(fetchMock, '/api/cobranza/contactos', 'PUT');
    const putBody = JSON.parse(fetchMock.mock.calls[putIndexes[0]]?.[1]?.body as string);
    expect(putBody.emailCopia).toBe('gerencia@cliente.com, contabilidad@cliente.com');

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    expect(postFormOf(fetchMock, postIndexes[0]).get('cc')).toBe(
      'gerencia@cliente.com,contabilidad@cliente.com'
    );
  });

  it('despacha los archivos locales como entradas attachments repetidas del FormData', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    const fileA = new File([new Uint8Array(8)], 'factura.pdf', { type: 'application/pdf' });
    const fileB = new File([new Uint8Array(8)], 'estado-cuenta.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    dropFiles([fileA, fileB]);
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const attachments = postFormOf(fetchMock, postIndexes[0]).getAll('attachments');
    expect(attachments).toHaveLength(2);
    expect((attachments[0] as File).name).toBe('factura.pdf');
    expect((attachments[1] as File).name).toBe('estado-cuenta.xlsx');
  });

  it('fallo de persistencia: NO se hace POST y el error se muestra', async () => {
    const fetchMock = stubFetchRouter({
      put: { body: { success: false, error: 'CONFLICT', code: 'CONFLICT_ERROR' }, ok: false, status: 409 },
    });

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText(/No se pudo guardar el contacto/i)).toBeInTheDocument();
    });
    expect(callsTo(fetchMock, '/api/send-email', 'POST')).toHaveLength(0);
  });

  it('fallo de envío tras persistir: el PUT queda hecho (contacto retenido) y el error se muestra', async () => {
    const fetchMock = stubFetchRouter({
      postResults: [
        { body: { success: false, error: 'Error SMTP del servidor', code: 'SMTP_ERROR' }, ok: false, status: 500 },
      ],
    });

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText(/Error SMTP del servidor/i)).toBeInTheDocument();
    });

    // Persist succeeded before the send failed — the contact is retained.
    expect(callsTo(fetchMock, '/api/cobranza/contactos', 'PUT')).toHaveLength(1);
    // Form data intact for the retry.
    expect(getToField()).toHaveValue('cobranzas@cliente.com');
  });

  it('clave basura: no memoriza (sin PUT) pero el correo sale igual con purpose cobranza', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer(JUNK_CLIENT);
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    // No directory traffic at all (no GET at mount, no PUT at confirm).
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/cobranza/contactos'))
    ).toHaveLength(0);

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    expect(postFormOf(fetchMock, postIndexes[0]).get('purpose')).toBe('cobranza');
  });

  // ---- REQ-02 R6: audit metadata transport (D3) ----

  it('envía los metadatos de auditoría (ruc, razonSocial, moneda, montoReclamado, comprobantesCount)', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer(); // mockClients[0]: S/ 1000 main saldo, 1 doc with saldo > 0.01
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const form = postFormOf(fetchMock, postIndexes[0]);
    // RAW amount (number, not the formatted string) + main-currency rule.
    expect(form.get('ruc')).toBe('20601234567');
    expect(form.get('razonSocial')).toBe('HOLOMEDIC S.A.C.');
    expect(form.get('moneda')).toBe('S/');
    expect(form.get('montoReclamado')).toBe('1000');
    expect(form.get('comprobantesCount')).toBe('1');
  });

  it('clave basura: audita el razonSocial tal cual (sin filtrar) junto al ruc', async () => {
    const fetchMock = stubFetchRouter();

    renderComposer(JUNK_CLIENT); // razonSocial 'CLIENTE SIN NOMBRE', ruc intact
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const form = postFormOf(fetchMock, postIndexes[0]);
    // Writes are NOT filtered by key validity (R6.2 — junk audited as-is).
    expect(form.get('ruc')).toBe('20601234567');
    expect(form.get('razonSocial')).toBe('CLIENTE SIN NOMBRE');
    expect(form.get('moneda')).toBe('S/');
  });

  // ---- UX flow (preserved from the modal) ----

  it('muestra el indicador de envío y deshabilita el cierre mientras se envía', () => {
    stubFetchRouter({ postPending: true });

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    expect(screen.getByTestId('sending-indicator')).toHaveTextContent(/enviando/i);
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeDisabled();
  });

  it('muestra botón Reintentar al fallar y permite re-envío exitoso', async () => {
    stubFetchRouter({
      postResults: [
        { body: { success: false, error: 'Error SMTP', code: 'SMTP_ERROR' }, ok: false, status: 500 },
        { body: { success: true } },
      ],
    });

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText(/Error SMTP/i)).toBeInTheDocument();
    });
    expect(getToField()).toHaveValue('cobranzas@cliente.com');

    // Retry skips the confirmation and succeeds this time.
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
  });

  it('muestra pantalla de confirmación antes de enviar con datos del destinatario', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');

    fireEvent.click(getSendButton());

    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();
    expect(screen.getByText(/cobranzas@cliente.com/)).toBeInTheDocument();
    expect(screen.queryByText(/^Cc:/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancelar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Confirmar envío$/i })).toBeInTheDocument();
  });

  it('vuelve al formulario al cancelar la confirmación', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');

    fireEvent.click(getSendButton());
    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    expect(screen.queryByText(/¿Confirmar envío?/i)).not.toBeInTheDocument();
    expect(getSendButton()).toBeInTheDocument();
  });

  it('permite múltiples destinatarios en el campo Para (visibles en la confirmación)', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com, pagos@cliente.com');

    fireEvent.click(getSendButton());

    expect(screen.getByText(/cobranzas@cliente.com/)).toBeInTheDocument();
    expect(screen.getByText(/pagos@cliente.com/)).toBeInTheDocument();
  });

  it('muestra el conteo de adjuntos en la confirmación', () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    dropFiles([
      new File([new Uint8Array(4)], 'a.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array(4)], 'b.pdf', { type: 'application/pdf' }),
    ]);

    fireEvent.click(getSendButton());

    expect(screen.getByText(/2 archivos adjuntos/i)).toBeInTheDocument();
  });

  it('muestra mensaje de error de conexión cuando el servidor no responde', async () => {
    stubFetchRouter({ postRejects: true });

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText(/Error de conexión/i)).toBeInTheDocument();
    });
    expect(getToField()).toHaveValue('cobranzas@cliente.com');
  });

  it('muestra pantalla de éxito cuando la API responde 200', async () => {
    stubFetchRouter();

    renderComposer();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/El correo de cobranza se ha enviado correctamente a HOLOMEDIC S.A.C./i)
    ).toBeInTheDocument();
  });

  it('NO contiene enlace mailto ni el texto "Abrir en Outlook/Gmail"', () => {
    stubFetchRouter();

    renderComposer();

    expect(screen.queryByText('Abrir en Outlook/Gmail')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /outlook/i })).not.toBeInTheDocument();
  });

  it('mantiene la nota informativa de cuentas bancarias', () => {
    stubFetchRouter();

    renderComposer();

    expect(screen.getByText(/Cuentas Bancarias Incluidas/i)).toBeInTheDocument();
  });
});
