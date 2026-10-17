import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { UseConfigAgenteResult } from '../../../hooks/useConfigAgente';
import type { UseConfigCanalResult } from '../../../hooks/useConfigCanal';
import type { UseConfigMemoriaResult } from '../../../hooks/useConfigMemoria';
import type { UseAuditoriaConfigResult, UseResumenConocimientoResult } from '../../../hooks/useAuditoriaConfig';

/**
 * UI contract for PanelConfiguracion (agente-ia-crm E5·T6): the four
 * accessible tabs + the kill-switch bar. Hooks are mocked at the module
 * boundary (each has its own contract suite).
 */

const mocks = vi.hoisted(() => ({
  agente: vi.fn(),
  canal: vi.fn(),
  memoria: vi.fn(),
  auditoria: vi.fn(),
  resumen: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('../../../hooks/useConfigAgente', async (original) => ({
  ...(await original<typeof import('../../../hooks/useConfigAgente')>()),
  useConfigAgente: mocks.agente,
}));
vi.mock('../../../hooks/useConfigCanal', async (original) => ({
  ...(await original<typeof import('../../../hooks/useConfigCanal')>()),
  useConfigCanal: mocks.canal,
}));
vi.mock('../../../hooks/useConfigMemoria', async (original) => ({
  ...(await original<typeof import('../../../hooks/useConfigMemoria')>()),
  useConfigMemoria: mocks.memoria,
}));
vi.mock('../../../hooks/useAuditoriaConfig', () => ({
  useAuditoriaConfig: mocks.auditoria,
  useResumenConocimiento: mocks.resumen,
}));
vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({ useAuth: mocks.auth }));

import { PanelConfiguracion } from '../PanelConfiguracion';

const SECRETO_UNICO = 'whsec_unico_visible_una_vez';

function agente(sobre: Partial<UseConfigAgenteResult> = {}): UseConfigAgenteResult {
  return {
    config: {
      habilitado: true,
      umbralConfianza: 0.6,
      maxIntercambios: 8,
      horarioDesde: 8,
      horarioHasta: 18,
      textoEscalado: 'Te paso con un asesor',
    },
    fuentes: {
      habilitado: 'default',
      umbralConfianza: 'db',
      maxIntercambios: 'env',
      horarioDesde: 'default',
      horarioHasta: 'default',
      textoEscalado: 'default',
    },
    status: 'populated',
    error: null,
    refetch: vi.fn(),
    guardar: vi.fn().mockResolvedValue(true),
    guardando: false,
    errorGuardado: null,
    limpiarErrorGuardado: vi.fn(),
    alternarKillSwitch: vi.fn().mockResolvedValue(true),
    cambiandoKillSwitch: false,
    errorKillSwitch: null,
    ...sobre,
  };
}

function canal(sobre: Partial<UseConfigCanalResult> = {}): UseConfigCanalResult {
  return {
    config: {
      modo: 'real',
      phoneNumberId: '1234567',
      timeoutMs: 15000,
      apiKey: { configurado: true, mascara: '••••9999' },
      webhookSecret: { configurado: true, mascara: '••••abcd' },
    },
    fuentes: { modo: 'db', apiKey: 'db', phoneNumberId: 'env', webhookSecret: 'default', timeoutMs: 'default' },
    status: 'populated',
    error: null,
    guardar: vi.fn().mockResolvedValue(true),
    guardando: false,
    errorGuardado: null,
    limpiarErrorGuardado: vi.fn(),
    claveNoConfigurada: false,
    regenerarWebhookSecret: vi.fn().mockResolvedValue(true),
    webhookSecretGenerado: null,
    descartarWebhookSecret: vi.fn(),
    probar: vi.fn().mockResolvedValue(undefined),
    probando: false,
    resultadoProbe: null,
    ...sobre,
  };
}

function memoria(sobre: Partial<UseConfigMemoriaResult> = {}): UseConfigMemoriaResult {
  return {
    config: { url: 'http://engram.local', timeoutMs: 5000, retencionMeses: 12, token: { configurado: false, mascara: '' } },
    fuentes: { url: 'db', token: 'default', timeoutMs: 'default', retencionMeses: 'default' },
    status: 'populated',
    error: null,
    guardar: vi.fn().mockResolvedValue(true),
    guardando: false,
    errorGuardado: null,
    limpiarErrorGuardado: vi.fn(),
    claveNoConfigurada: false,
    probar: vi.fn().mockResolvedValue(undefined),
    probando: false,
    resultadoProbe: null,
    ...sobre,
  };
}

function historial(sobre: Partial<UseAuditoriaConfigResult> = {}): UseAuditoriaConfigResult {
  return { filas: [], status: 'populated', error: null, recargar: vi.fn(), ...sobre };
}

function resumen(sobre: Partial<UseResumenConocimientoResult> = {}): UseResumenConocimientoResult {
  return {
    resumen: {
      total: 14,
      porOrigen: { MANUAL: 4, SEMILLA: 0, SUBIDO: 10 },
      ingestasPorEstado: { PENDIENTE: 1, PROCESANDO: 0, COMPLETADA: 6, FALLIDA: 2 },
    },
    status: 'populated',
    error: null,
    ...sobre,
  };
}

function irATab(nombre: string): void {
  fireEvent.click(screen.getByRole('tab', { name: nombre }));
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.agente.mockReturnValue(agente());
  mocks.canal.mockReturnValue(canal());
  mocks.memoria.mockReturnValue(memoria());
  mocks.auditoria.mockReturnValue(historial());
  mocks.resumen.mockReturnValue(resumen());
  mocks.auth.mockReturnValue({ user: { permisos: ['crm_configuracion', 'crm_conocimiento'] } });
});

describe('PanelConfiguracion — tabs accesibles', () => {
  it('expone tablist con 4 tabs, la primera seleccionada y su tabpanel enlazado', () => {
    render(<PanelConfiguracion />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Agente', 'Canal Kapso', 'Memoria', 'Conocimiento']);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id);
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
  });

  it('flechas, Home y End mueven selección y foco con wrap-around', () => {
    render(<PanelConfiguracion />);
    const tabs = screen.getAllByRole('tab');

    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveFocus();

    fireEvent.keyDown(tabs[1], { key: 'End' });
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[3], { key: 'ArrowRight' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' });
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tabs[3], { key: 'Home' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('el kill switch sigue visible en cualquier pestaña', () => {
    render(<PanelConfiguracion />);
    irATab('Memoria');

    expect(screen.getByRole('switch')).toBeInTheDocument();
  });
});

describe('PanelConfiguracion — tab Agente', () => {
  it('muestra los valores y el chip de origen por campo', () => {
    render(<PanelConfiguracion />);

    expect(screen.getByLabelText('Umbral de confianza')).toHaveValue(0.6);
    expect(screen.getByLabelText('Máximo de intercambios')).toHaveValue(8);
    expect(screen.getByLabelText('Horario desde (hora)')).toHaveValue(8);
    expect(screen.getByLabelText('Texto de escalado')).toHaveValue('Te paso con un asesor');
    expect(screen.getAllByText('BD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Entorno').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Por defecto').length).toBeGreaterThan(0);
  });

  it('Guardar está deshabilitado mientras esté pristine y envía solo lo cambiado', async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    mocks.agente.mockReturnValue(agente({ guardar }));
    render(<PanelConfiguracion />);
    const boton = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(boton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Umbral de confianza'), { target: { value: '0.75' } });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);

    await waitFor(() => expect(guardar).toHaveBeenCalledWith({ umbralConfianza: 0.75 }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(screen.getByText('Cambios guardados.').closest('[aria-live]')).not.toBeNull();
  });

  it('validación cliente: umbral fuera de rango no llama al servidor y marca el campo', () => {
    const guardar = vi.fn();
    mocks.agente.mockReturnValue(agente({ guardar }));
    render(<PanelConfiguracion />);

    fireEvent.change(screen.getByLabelText('Umbral de confianza'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(guardar).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Umbral de confianza');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('El umbral debe ser mayor que 0 y hasta 1.')).toBeInTheDocument();
  });

  it('el error del servidor con campo se muestra junto a ese campo', () => {
    mocks.agente.mockReturnValue(
      agente({ errorGuardado: { mensaje: 'maxIntercambios debe ser un entero >= 1', campo: 'maxIntercambios', code: 'VALIDATION_ERROR' } }),
    );
    render(<PanelConfiguracion />);

    const input = screen.getByLabelText('Máximo de intercambios');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('maxIntercambios debe ser un entero >= 1')).toBeInTheDocument();
  });

  it('el kill switch llama al hook y no cambia por su cuenta', async () => {
    const alternar = vi.fn().mockResolvedValue(true);
    mocks.agente.mockReturnValue(agente({ alternarKillSwitch: alternar }));
    render(<PanelConfiguracion />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(alternar).toHaveBeenCalledWith(false));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('error de carga muestra un mensaje en vez del formulario', () => {
    mocks.agente.mockReturnValue(agente({ config: null, fuentes: null, status: 'error', error: 'No se pudo cargar (HTTP 500)' }));
    render(<PanelConfiguracion />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar (HTTP 500)');
    expect(screen.queryByLabelText('Umbral de confianza')).not.toBeInTheDocument();
  });
});

describe('PanelConfiguracion — tab Canal Kapso', () => {
  it('los secretos muestran máscara y badge, nunca un input con valor', () => {
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    expect(screen.getByText('••••9999')).toBeInTheDocument();
    expect(screen.getByText('••••abcd')).toBeInTheDocument();
    expect(screen.getAllByText('Configurada')).toHaveLength(2);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByLabelText('Phone number ID')).toHaveValue('1234567');
  });

  it('muestra la URL del webhook y la copia', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    const url = `${window.location.origin}/api/webhooks/kapso`;
    expect(screen.getByDisplayValue(url)).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar URL del webhook' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(await screen.findByText('Copiado')).toBeInTheDocument();
  });

  it('Probar conexión muestra loading y el resultado', () => {
    mocks.canal.mockReturnValue(canal({ probando: true }));
    const { unmount } = render(<PanelConfiguracion />);
    irATab('Canal Kapso');
    expect(screen.getByRole('button', { name: /Probando/ })).toBeDisabled();
    unmount();

    mocks.canal.mockReturnValue(canal({ resultadoProbe: { ok: true, detalle: 'Conexión correcta' } }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');
    expect(screen.getByText(/Conexión correcta/)).toBeInTheDocument();
  });

  it('regenerar pide confirmación inline y luego llama al hook', async () => {
    const regenerar = vi.fn().mockResolvedValue(true);
    mocks.canal.mockReturnValue(canal({ regenerarWebhookSecret: regenerar }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    fireEvent.click(screen.getByRole('button', { name: 'Regenerar secret del webhook' }));
    expect(regenerar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, regenerar' }));

    await waitFor(() => expect(regenerar).toHaveBeenCalledTimes(1));
  });

  it('el secret regenerado se muestra una vez, copiable, con advertencia, y se descarta al cerrarlo', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const descartar = vi.fn();
    mocks.canal.mockReturnValue(canal({ webhookSecretGenerado: SECRETO_UNICO, descartarWebhookSecret: descartar }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    const campo = screen.getByDisplayValue(SECRETO_UNICO);
    expect(campo).toHaveAttribute('readonly');
    expect(screen.getByText(/no se volverá a mostrar/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar secret generado' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRETO_UNICO));

    descartar.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Ya lo copié' }));
    expect(descartar).toHaveBeenCalledTimes(1);
  });

  it('cambiar de pestaña descarta el secret regenerado', () => {
    const descartar = vi.fn();
    mocks.canal.mockReturnValue(canal({ webhookSecretGenerado: SECRETO_UNICO, descartarWebhookSecret: descartar }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    irATab('Memoria');

    expect(descartar).toHaveBeenCalled();
    expect(screen.queryByDisplayValue(SECRETO_UNICO)).not.toBeInTheDocument();
  });

  it('CLAVE_NO_CONFIGURADA: aviso bloqueante y edición de secretos deshabilitada', () => {
    mocks.canal.mockReturnValue(canal({ claveNoConfigurada: true }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    expect(screen.getByRole('alert')).toHaveTextContent('CRM_CONFIG_KEY');
    expect(screen.getByRole('button', { name: 'Reemplazar API key' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Regenerar secret del webhook' })).toBeDisabled();
  });

  it('guarda solo los campos no secretos modificados', async () => {
    const guardar = vi.fn().mockResolvedValue(true);
    mocks.canal.mockReturnValue(canal({ guardar }));
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');

    fireEvent.change(screen.getByLabelText('Modo'), { target: { value: 'simulado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(guardar).toHaveBeenCalledWith({ modo: 'simulado' }));
  });
});

describe('PanelConfiguracion — tab Memoria', () => {
  it('muestra campos, token como secreto y valida retención 1-120', () => {
    const guardar = vi.fn();
    mocks.memoria.mockReturnValue(memoria({ guardar }));
    render(<PanelConfiguracion />);
    irATab('Memoria');

    expect(screen.getByLabelText('URL de Engram')).toHaveValue('http://engram.local');
    expect(screen.getByText('Sin configurar')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Retención (meses)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByText('La retención debe ser un entero entre 1 y 120.')).toBeInTheDocument();
  });

  it('Probar conexión llama al hook', () => {
    const probar = vi.fn().mockResolvedValue(undefined);
    mocks.memoria.mockReturnValue(memoria({ probar }));
    render(<PanelConfiguracion />);
    irATab('Memoria');

    fireEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));

    expect(probar).toHaveBeenCalledTimes(1);
  });

  it('CLAVE_NO_CONFIGURADA bloquea el token', () => {
    mocks.memoria.mockReturnValue(memoria({ claveNoConfigurada: true }));
    render(<PanelConfiguracion />);
    irATab('Memoria');

    expect(screen.getByRole('alert')).toHaveTextContent('CRM_CONFIG_KEY');
    expect(screen.getByRole('button', { name: 'Reemplazar Token' })).toBeDisabled();
  });
});

describe('PanelConfiguracion — tab Conocimiento', () => {
  it('muestra totales por origen y por estado de ingesta', () => {
    render(<PanelConfiguracion />);
    irATab('Conocimiento');

    expect(screen.getByText('Entradas activas')).toBeInTheDocument();
    expect(screen.getByTestId('conocimiento-total')).toHaveTextContent('14');
    const origen = screen.getByRole('region', { name: 'Por origen' });
    expect(within(origen).getByText('Subido')).toBeInTheDocument();
    expect(within(origen).getByText('10')).toBeInTheDocument();
    const ingestas = screen.getByRole('region', { name: 'Ingestas por estado' });
    expect(within(ingestas).getByText('Fallida')).toBeInTheDocument();
  });

  it('con crm_conocimiento enlaza al editor', () => {
    render(<PanelConfiguracion />);
    irATab('Conocimiento');

    expect(screen.getByRole('link', { name: /Administrar conocimiento/ })).toHaveAttribute(
      'href',
      '/admin/crm/conocimiento',
    );
  });

  it('sin crm_conocimiento explica que es otro permiso y no muestra el enlace', () => {
    mocks.auth.mockReturnValue({ user: { permisos: ['crm_configuracion'] } });
    render(<PanelConfiguracion />);
    irATab('Conocimiento');

    expect(screen.queryByRole('link', { name: /Administrar conocimiento/ })).not.toBeInTheDocument();
    expect(screen.getByText(/permiso aparte/i)).toBeInTheDocument();
  });

  it('error del resumen se muestra', () => {
    mocks.resumen.mockReturnValue(resumen({ resumen: null, status: 'error', error: 'No se pudo cargar el resumen (HTTP 503)' }));
    render(<PanelConfiguracion />);
    irATab('Conocimiento');

    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 503');
  });
});

describe('PanelConfiguracion — historial de cambios', () => {
  const filas = [
    { id: 2, clave: 'agente.umbralConfianza', usuario: 'Juana Perez', valorAnterior: '0.6', valorNuevo: '0.75', esSecreto: false, creadoEn: '2026-10-17T10:00:00.000Z' },
    { id: 1, clave: 'canal.kapso.apiKey', usuario: 'Luis Soto', valorAnterior: null, valorNuevo: null, esSecreto: true, creadoEn: '2026-10-16T09:00:00.000Z' },
  ];

  it('es colapsable: cerrado no consulta; abierto pide el prefijo de la pestaña', () => {
    render(<PanelConfiguracion />);
    expect(mocks.auditoria).not.toHaveBeenCalled();

    const toggle = screen.getByRole('button', { name: /Historial de cambios/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(mocks.auditoria).toHaveBeenCalledWith('agente.');
  });

  it('usa canal.kapso. y memoria. según la pestaña activa', () => {
    render(<PanelConfiguracion />);
    irATab('Canal Kapso');
    fireEvent.click(screen.getByRole('button', { name: /Historial de cambios/ }));
    expect(mocks.auditoria).toHaveBeenCalledWith('canal.kapso.');

    irATab('Memoria');
    fireEvent.click(screen.getByRole('button', { name: /Historial de cambios/ }));
    expect(mocks.auditoria).toHaveBeenLastCalledWith('memoria.');
  });

  it('filas: usuario, clave, valor anterior → nuevo; secretos solo "secreto modificado"', () => {
    mocks.auditoria.mockReturnValue(historial({ filas }));
    render(<PanelConfiguracion />);
    fireEvent.click(screen.getByRole('button', { name: /Historial de cambios/ }));

    expect(screen.getByText('Juana Perez')).toBeInTheDocument();
    expect(screen.getByText('agente.umbralConfianza')).toBeInTheDocument();
    expect(screen.getByText('0.6 → 0.75')).toBeInTheDocument();
    expect(screen.getByText('secreto modificado')).toBeInTheDocument();
  });

  it('vacío y error tienen mensaje propio', () => {
    mocks.auditoria.mockReturnValue(historial());
    const { unmount } = render(<PanelConfiguracion />);
    fireEvent.click(screen.getByRole('button', { name: /Historial de cambios/ }));
    expect(screen.getByText('Aún no hay cambios registrados.')).toBeInTheDocument();
    unmount();

    mocks.auditoria.mockReturnValue(historial({ status: 'error', error: 'No se pudo cargar el historial (HTTP 500)' }));
    render(<PanelConfiguracion />);
    fireEvent.click(screen.getByRole('button', { name: /Historial de cambios/ }));
    expect(screen.getByText('No se pudo cargar el historial (HTTP 500)')).toBeInTheDocument();
  });
});

