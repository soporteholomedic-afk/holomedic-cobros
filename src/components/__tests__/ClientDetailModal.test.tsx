import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClientDetailModal from '../ClientDetailModal';
import { mockClients } from '../../utils/__tests__/mockData';
import { ClienteGroup } from '../../types';

// ---------------------------------------------------------------------------
// Fetch stub (REQ-02 R4): the embedded HistorialNotificaciones section
// GETs /api/cobranza/historial/{ruc} on mount — stubbed at the global
// boundary with an empty history by default (the module-boundary mock
// convention; per-test overrides via stubHistorial).
// ---------------------------------------------------------------------------

const HISTORIAL_ROW = {
  id: 2,
  ruc: '20601234567',
  razonSocial: 'HOLOMEDIC S.A.C.',
  destinatarios: ['contacto@empresa.com'],
  copias: null,
  asunto: 'Recordatorio de pago',
  montoReclamado: 1234.56,
  moneda: 'S/',
  comprobantesCount: 1,
  estadoEnvio: 'SUCCESS',
  errorDetalle: null,
  enviadoPor: 'María Pérez',
  fechaEnvio: '2026-08-22T14:30:00.000Z',
};

function stubHistorial(envios: unknown[] = []): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, envios }),
    } as unknown as Response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ClientDetailModal Component', () => {
  beforeEach(() => {
    stubHistorial();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('debe renderizar el detalle del cliente, RUC, estado consolidado y lista de documentos', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]} // HOLOMEDIC S.A.C. (deudor de S/ 1000.00)
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );
    
    expect(screen.getByText('HOLOMEDIC S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('20601234567')).toBeInTheDocument();
    
    // Verificar que renderice los saldos consolidados
    expect(screen.getByText('S/')).toBeInTheDocument();
    expect(screen.getByText('1,000.00')).toBeInTheDocument();
    expect(screen.getByText('Cliente deudor')).toBeInTheDocument();

    // Verificar documentos en tabla
    expect(screen.getByText('F001-101')).toBeInTheDocument();
    expect(screen.getByText('F001-102')).toBeInTheDocument();

    // Documento F001-101 (Vence 20/05/2026) debe figurar como VENCIDO
    // (Dado que la fecha del sistema actual es posterior a mayo de 2026)
    expect(screen.getByText('VENCIDO')).toBeInTheDocument();
  });

  it('debe llamar a onClose cuando se presiona el botón de cerrar', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    const closeButton = screen.getByText('Cerrar');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('debe llamar a onOpenEmailComposer cuando se presiona "Enviar Correo de Cobro"', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();
    
    render(
      <ClientDetailModal
        client={mockClients[0]} // HOLOMEDIC S.A.C (tieneDeuda = true)
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    const sendEmailButton = screen.getByText('Enviar Correo de Cobro');
    fireEvent.click(sendEmailButton);
    expect(onOpenEmailComposer).toHaveBeenCalledTimes(1);
    expect(onOpenEmailComposer).toHaveBeenCalledWith(mockClients[0]);
  });

  // ============================================================
  // T-MODAL-5 — Días Vencido + Estado chip tests
  // ============================================================

  it('renders Estado chip Vencido for overdue doc with positive balance', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    render(
      <ClientDetailModal
        client={mockClients[0]} // HOLOMEDIC F001-101: fechaVen 20/05/2026, saldo 1000 (overdue)
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    // The new chip text is "Vencido" (case-sensitive, exact — distinct from the existing "VENCIDO" badge)
    const vencidoChip = screen.getByText('Vencido');
    expect(vencidoChip).toBeInTheDocument();
    expect(vencidoChip).toHaveClass('text-rose-700');
  });

  it('renders Crédito vigente card for future-due doc with positive balance', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    // Date-relative fixture: fechaVen must stay in the future for the
    // doc to hit the CREDITO branch on any run date.
    const fechaVen = new Date();
    fechaVen.setDate(fechaVen.getDate() + 30);

    // Inline fixture: a client with one future-due, positive-balance doc → CREDITO branch.
    const futureCreditClient: ClienteGroup = {
      clienteId: '20999888777',
      razonSocial: 'CLIENTE FUTURO S.A.',
      documentos: [
        {
          tipoDoc: 'FA',
          serie: 'F003',
          numero: '456',
          fechaDoc: '20/06/2026',
          fechaVen: `${String(fechaVen.getDate()).padStart(2, '0')}/${String(fechaVen.getMonth() + 1).padStart(2, '0')}/${fechaVen.getFullYear()}`,
          moneda: 'S/',
          debe: 500,
          haber: 0,
          saldo: 500,
        },
      ],
      saldosPorMoneda: { 'S/': { debe: 500, haber: 0, saldo: 500 } },
      tieneDeuda: false,
      tieneCredito: true,
      tieneSaldoFavor: false,
      saldoPrincipalTexto: 'Crédito S/ 500.00',
      facturasCredito: 1,
      facturasAFavor: 0,
      facturasVencidas: 0,
    };

    render(
      <ClientDetailModal
        client={futureCreditClient}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    // The status card (chip → card redesign) shows the credit badge.
    const creditoCard = screen.getByText('Crédito vigente').closest('div');
    expect(creditoCard).toHaveClass('text-amber-800');
  });

  it('renders plain dash for Estado when saldo is zero or negative', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    const { container } = render(
      <ClientDetailModal
        client={mockClients[1]} // JUAN PEREZ: saldo -200 → Estado dash
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    // Estado header still present
    expect(screen.getByText('Estado', { selector: 'th' })).toBeInTheDocument();
    // The new Estado cell renders a plain "-" span (at least one across the row)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
    // No chip spans for this client's Estado column
    expect(container.querySelectorAll('span.text-rose-700, span.text-amber-700').length).toBe(0);
  });

  it('renders S/V in Días Vencido when fechaVen is empty', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    // Inline fixture: a single doc with empty fechaVen and positive balance.
    const emptyDateClient: ClienteGroup = {
      clienteId: '20123456789',
      razonSocial: 'CLIENTE SIN VENC S.A.C.',
      documentos: [
        {
          tipoDoc: 'FE',
          serie: 'F004',
          numero: '001',
          fechaDoc: '01/05/2026',
          fechaVen: '',
          moneda: 'S/',
          debe: 500,
          haber: 0,
          saldo: 500,
        },
      ],
      saldosPorMoneda: { 'S/': { debe: 500, haber: 0, saldo: 500 } },
      tieneDeuda: false,
      tieneCredito: false,
      tieneSaldoFavor: false,
      saldoPrincipalTexto: 'Debe S/ 500.00',
      facturasCredito: 0,
      facturasAFavor: 0,
      facturasVencidas: 0,
    };

    render(
      <ClientDetailModal
        client={emptyDateClient}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    // S/V appears once in the Fec. Vencimiento cell (existing logic) and once in the new Días Vencido cell.
    expect(screen.getAllByText('S/V').length).toBeGreaterThanOrEqual(2);
  });

  it('does not break Cuenta conditional column (regression)', () => {
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    // mockClients[0] documents all carry a `cuenta` → header must be present
    const { rerender } = render(
      <ClientDetailModal
        client={mockClients[0]}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );
    expect(screen.getByText('Cuenta')).toBeInTheDocument();

    // Inline fixture with no `cuenta` field on any doc → header must disappear
    const noCuentaClient: ClienteGroup = {
      clienteId: '20555666777',
      razonSocial: 'CLIENTE SIN CUENTA S.A.',
      documentos: [
        {
          tipoDoc: 'FE',
          serie: 'F005',
          numero: '999',
          fechaDoc: '01/05/2026',
          fechaVen: '20/05/2026',
          moneda: 'S/',
          debe: 100,
          haber: 0,
          saldo: 100,
        },
      ],
      saldosPorMoneda: { 'S/': { debe: 100, haber: 0, saldo: 100 } },
      tieneDeuda: true,
      tieneCredito: false,
      tieneSaldoFavor: false,
      saldoPrincipalTexto: 'Debe S/ 100.00',
      facturasCredito: 0,
      facturasAFavor: 0,
      facturasVencidas: 1,
    };

    rerender(
      <ClientDetailModal
        client={noCuentaClient}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );
    expect(screen.queryByText('Cuenta')).toBeNull();
    // New columns still render regardless of Cuenta
    expect(screen.getByText('Días Vencido')).toBeInTheDocument();
    expect(screen.getByText('Estado', { selector: 'th' })).toBeInTheDocument();
  });

  // ============================================================
  // REQ-02 R4 — Historial de Notificaciones section
  // ============================================================

  it('renders the HistorialNotificaciones section after the documents table with the client key', async () => {
    const fetchMock = stubHistorial([HISTORIAL_ROW]);
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    render(
      <ClientDetailModal
        client={mockClients[0]}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    // The section appears with its heading and fetches by the client's clienteId.
    await waitFor(() => {
      expect(screen.getByText('Historial de Notificaciones')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/cobranza/historial/20601234567', {
      method: 'GET',
    });

    // Documents table still present — the section is ADDITIVE (R4 order:
    // after "Documentos en Cuenta Corriente").
    expect(screen.getByText('Documentos en Cuenta Corriente')).toBeInTheDocument();

    // The audited row renders (badge + amount + sender). 1234.56 is
    // distinct from the documents-table saldo amounts on purpose.
    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });
    expect(screen.getByText('S/ 1,234.56')).toBeInTheDocument();
    expect(screen.getByText('María Pérez')).toBeInTheDocument();
  });

  it('shows the empty history state when the client has no audited sends (R4.2)', async () => {
    stubHistorial([]);
    const onClose = vi.fn();
    const onOpenEmailComposer = vi.fn();

    render(
      <ClientDetailModal
        client={mockClients[0]}
        onClose={onClose}
        onOpenEmailComposer={onOpenEmailComposer}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Aún no hay envíos de cobranza registrados para este cliente'),
      ).toBeInTheDocument();
    });
  });
});
