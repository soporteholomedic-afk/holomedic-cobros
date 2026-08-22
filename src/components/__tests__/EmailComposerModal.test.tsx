import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailComposerModal } from '../EmailComposerModal';
import { mockClients } from '../../utils/__tests__/mockData';
import type { ClienteGroup } from '../../types';

// ---------------------------------------------------------------------------
// Mocks (REQ-01 DIR-03/06/07): SpitchSelector + useAuth are mocked at the
// module boundary; fetch is routed per-endpoint (GET/PUT contactos, POST
// send-email) so call ORDER and payloads are assertable.
// ---------------------------------------------------------------------------

const { SAMPLE_SPITCH } = vi.hoisted(() => ({
  SAMPLE_SPITCH: {
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
  },
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

vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      idUsuario: '1',
      usuario: 'mperez',
      nombre: 'María Pérez',
      area: 'consolidados',
      permisos: ['cobranza'],
      activo: true,
    },
    loading: false,
    login: async () => {},
    logout: async () => {},
    refresh: async () => {},
  }),
}));

// ---------------------------------------------------------------------------
// Fetch router
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
  /** Sequenced POST outcomes; the last one repeats. */
  postResults?: RouteResponse[];
  /** POST never settles (spinner test). */
  postPending?: boolean;
  /** POST rejects (network error test). */
  postRejects?: boolean;
}

function stubFetchRouter(options: RouterOptions = {}) {
  const get = options.get ?? { body: { success: true, contacto: null } };
  const put = options.put ?? { body: { success: true, contacto: STORED_CONTACT } };
  const postResults = options.postResults ?? [{ body: { success: true } }];
  let postCall = 0;

  const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const JUNK_CLIENT: ClienteGroup = { ...mockClients[0], razonSocial: 'CLIENTE SIN NOMBRE' };

function renderModal(client: ClienteGroup = mockClients[0]) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(<EmailComposerModal client={client} onClose={onClose} onSuccess={onSuccess} />);
  return { onClose, onSuccess };
}

function getToField() {
  return screen.getByPlaceholderText('correo1@dominio.com, correo2@dominio.com');
}

function getCcField() {
  return screen.getByPlaceholderText('cc@dominio.com, cc2@dominio.com (opcional)');
}

function getIframeSrcDoc(): string {
  const iframe = document.querySelector('iframe[title="Vista previa del correo HTML"]');
  return iframe?.getAttribute('srcdoc') ?? '';
}

function selectTemplate() {
  fireEvent.click(screen.getByTestId('spitch-mock-select'));
}

function fillTo(value: string) {
  fireEvent.change(getToField(), { target: { value } });
}

function submitAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirmar envío$/i }));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('EmailComposerModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- DIR-03: prefill ----

  it('debe dejar los campos vacíos con placeholder cuando no hay contacto guardado (sin correo inventado)', () => {
    stubFetchRouter(); // GET → contacto: null

    renderModal();

    expect(getToField()).toHaveValue('');
    expect(getCcField()).toHaveValue('');
    // The fabricated administracion@<razonSocial>.com default is gone.
    expect(document.body.textContent).not.toMatch(/administracion@/);
  });

  it('debe pre-poblar to/cc desde el contacto guardado por RUC', async () => {
    stubFetchRouter({ get: { body: { success: true, contacto: STORED_CONTACT } } });

    renderModal();

    await waitFor(() => {
      expect(getToField()).toHaveValue('contacto@empresa.com');
    });
    expect(getCcField()).toHaveValue('gerencia@empresa.com');
  });

  it('clave basura (CLIENTE SIN NOMBRE): no hace GET y los campos quedan vacíos', () => {
    const fetchMock = stubFetchRouter();

    renderModal(JUNK_CLIENT);

    expect(getToField()).toHaveValue('');
    expect(getCcField()).toHaveValue('');
    expect(callsTo(fetchMock, '/api/cobranza/contactos', 'GET')).toHaveLength(0);
  });

  it('GET falla: el modal sigue operativo con campos vacíos (degradación elegante)', () => {
    stubFetchRouter({
      get: { body: { success: false, error: 'INTERNAL_ERROR' }, ok: false, status: 500 },
    });

    renderModal();

    expect(getToField()).toHaveValue('');
    expect(screen.getByRole('button', { name: /^Enviar correo$/i })).toBeInTheDocument();
  });

  // ---- DIR-06/D8: template flow ----

  it('debe renderizar SpitchSelector para el área cobranza (target company)', () => {
    stubFetchRouter();

    renderModal();

    const selector = screen.getByTestId('spitch-selector-mock');
    expect(selector.getAttribute('data-area')).toBe('cobranza');
    expect(selector.getAttribute('data-target')).toBe('company');
  });

  it('al seleccionar plantilla interpola en tiempo real (iframe srcDoc + asunto)', () => {
    stubFetchRouter();

    renderModal();

    selectTemplate();

    const srcDoc = getIframeSrcDoc();
    expect(srcDoc).toContain('Estimados HOLOMEDIC S.A.C.');
    expect(srcDoc).toContain('RUC 20601234567');
    expect(srcDoc).toContain('S/ 1,000.00');
    expect(srcDoc).toContain('FE F001-101'); // documentosPendientes table row
    expect(srcDoc).toContain('DATOS PARA EL PAGO'); // cuentasBancarias
    expect(srcDoc).toContain('María Pérez'); // firma from session user
    expect(
      screen.getByDisplayValue('Recordatorio HOLOMEDIC S.A.C. — deuda S/ 1,000.00')
    ).toBeInTheDocument();
  });

  it('botón Enviar deshabilitado hasta seleccionar una plantilla (plantilla obligatoria)', () => {
    stubFetchRouter();

    renderModal();

    expect(screen.getByRole('button', { name: /^Enviar correo$/i })).toBeDisabled();

    selectTemplate();

    expect(screen.getByRole('button', { name: /^Enviar correo$/i })).not.toBeDisabled();
  });

  // ---- DIR-07: persist-before-dispatch ----

  it('debe hacer PUT (memorizar contacto) ANTES del POST y enviar purpose cobranza', async () => {
    const fetchMock = stubFetchRouter();

    renderModal();
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

    // POST body: purpose 'cobranza' + interpolated html + recipients.
    const postCall = fetchMock.mock.calls[postIndexes[0]];
    const postBody = JSON.parse(postCall?.[1]?.body as string);
    expect(postBody.purpose).toBe('cobranza');
    expect(postBody.to).toEqual(['cobranzas@cliente.com']);
    expect(postBody.subject).toBe('Recordatorio HOLOMEDIC S.A.C. — deuda S/ 1,000.00');
    expect(postBody.html).toContain('Estimados HOLOMEDIC S.A.C.');
    expect(postBody).not.toHaveProperty('cc');
  });

  it('debe enviar cc en el payload y memorizarlo como emailCopia (unido por coma)', async () => {
    const fetchMock = stubFetchRouter();

    renderModal();
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
    const postBody = JSON.parse(fetchMock.mock.calls[postIndexes[0]]?.[1]?.body as string);
    expect(postBody.cc).toEqual(['gerencia@cliente.com', 'contabilidad@cliente.com']);
  });

  it('fallo de persistencia: NO se hace POST y el error se muestra', async () => {
    const fetchMock = stubFetchRouter({
      put: { body: { success: false, error: 'CONFLICT', code: 'CONFLICT_ERROR' }, ok: false, status: 409 },
    });

    renderModal();
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

    renderModal();
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

    renderModal(JUNK_CLIENT);
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    // No directory traffic at all (no GET at mount, no PUT at confirm).
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/cobranza/contactos'))).toHaveLength(0);

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    expect(postIndexes).toHaveLength(1);
    const postBody = JSON.parse(fetchMock.mock.calls[postIndexes[0]]?.[1]?.body as string);
    expect(postBody.purpose).toBe('cobranza');
  });

  // ---- REQ-02 R6: audit metadata transport (D3) ----

  it('debe enviar los metadatos de auditoría (ruc, razonSocial, moneda, montoReclamado, comprobantesCount) en el POST', async () => {
    const fetchMock = stubFetchRouter();

    renderModal(); // mockClients[0]: S/ 1000 main saldo, 1 doc with saldo > 0.01
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const postBody = JSON.parse(fetchMock.mock.calls[postIndexes[0]]?.[1]?.body as string);
    // RAW amount (number, not the formatted string) + main-currency rule.
    expect(postBody.ruc).toBe('20601234567');
    expect(postBody.razonSocial).toBe('HOLOMEDIC S.A.C.');
    expect(postBody.moneda).toBe('S/');
    expect(postBody.montoReclamado).toBe(1000);
    expect(postBody.comprobantesCount).toBe(1);
  });

  it('clave basura: audita el razonSocial tal cual (sin filtrar) junto al ruc', async () => {
    const fetchMock = stubFetchRouter();

    renderModal(JUNK_CLIENT); // razonSocial 'CLIENTE SIN NOMBRE', ruc intact
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });

    const postIndexes = callsTo(fetchMock, '/api/send-email', 'POST');
    const postBody = JSON.parse(fetchMock.mock.calls[postIndexes[0]]?.[1]?.body as string);
    // Writes are NOT filtered by key validity (R6.2 — junk audited as-is).
    expect(postBody.ruc).toBe('20601234567');
    expect(postBody.razonSocial).toBe('CLIENTE SIN NOMBRE');
    expect(postBody.moneda).toBe('S/');
  });

  // ---- UX flow (preserved from the previous modal) ----

  it('debe mostrar spinner mientras se envía el correo', () => {
    stubFetchRouter({ postPending: true });

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
  });

  it('debe mostrar botón Reintentar al fallar y permitir re-envío exitoso', async () => {
    stubFetchRouter({
      postResults: [
        { body: { success: false, error: 'Error SMTP', code: 'SMTP_ERROR' }, ok: false, status: 500 },
        { body: { success: true } },
      ],
    });

    renderModal();
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

  it('debe mostrar pantalla de confirmación antes de enviar con datos del destinatario', () => {
    stubFetchRouter();

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');

    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));

    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();
    expect(screen.getByText(/cobranzas@cliente.com/)).toBeInTheDocument();
    expect(screen.queryByText(/^Cc:/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cancelar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Confirmar envío$/i })).toBeInTheDocument();
  });

  it('debe volver al formulario al cancelar la confirmación', () => {
    stubFetchRouter();

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');

    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));
    expect(screen.getByText(/¿Confirmar envío?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));
    expect(screen.queryByText(/¿Confirmar envío?/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enviar correo$/i })).toBeInTheDocument();
  });

  it('debe permitir múltiples destinatarios en el campo Para', () => {
    stubFetchRouter();

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com, pagos@cliente.com');

    fireEvent.click(screen.getByRole('button', { name: /^Enviar correo$/i }));

    expect(screen.getByText(/cobranzas@cliente.com/)).toBeInTheDocument();
    expect(screen.getByText(/pagos@cliente.com/)).toBeInTheDocument();
  });

  it('debe deshabilitar el botón Cancelar mientras se está enviando', () => {
    stubFetchRouter({ postPending: true });

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    expect(screen.getByText('Enviando...')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeDisabled();
  });

  it('debe mostrar mensaje de error de conexión cuando el servidor no responde', async () => {
    stubFetchRouter({ postRejects: true });

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText(/Error de conexión/i)).toBeInTheDocument();
    });
    expect(getToField()).toHaveValue('cobranzas@cliente.com');
  });

  it('debe mostrar pantalla de éxito cuando la API responde 200', async () => {
    stubFetchRouter();

    renderModal();
    selectTemplate();
    fillTo('cobranzas@cliente.com');
    submitAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('¡Correo Enviado!')).toBeInTheDocument();
    });
  });

  it('NO debe contener enlace mailto ni el texto "Abrir en Outlook/Gmail"', () => {
    stubFetchRouter();

    renderModal();

    expect(screen.queryByText('Abrir en Outlook/Gmail')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /outlook/i })).not.toBeInTheDocument();
  });
});
