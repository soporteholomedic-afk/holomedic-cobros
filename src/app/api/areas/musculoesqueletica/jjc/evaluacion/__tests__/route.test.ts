import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST, GET } from '../route';

const saveExecute = vi.hoisted(() => vi.fn());
const loadExecute = vi.hoisted(() => vi.fn());

vi.mock('@/features/evaluacion-osteomuscular/composition/container', () => ({
  buildSaveEvaluacionOsteomuscular: () => ({ execute: saveExecute }),
  buildLoadEvaluacionOsteomuscular: () => ({ execute: loadExecute }),
}));

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  saveExecute.mockReset();
  loadExecute.mockReset();
});

describe('POST /api/areas/musculoesqueletica/jjc/evaluacion', () => {
  it('devuelve 200 cuando el guardado es exitoso', async () => {
    saveExecute.mockResolvedValue({ ok: true });

    const res = await POST(
      jsonRequest('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion', {
        idAtencion: 'AT-1001',
        evaluacion: { idAtencion: 'AT-1001', evaluacionClinicaOsteomuscular: {} },
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, idAtencion: 'AT-1001' });
    expect(saveExecute).toHaveBeenCalledWith({
      idAtencion: 'AT-1001',
      evaluacion: expect.objectContaining({ idAtencion: 'AT-1001' }),
    });
  });

  it('devuelve 400 con error tipado cuando falla la validación', async () => {
    saveExecute.mockResolvedValue({
      ok: false,
      error: 'evaluacion.evaluacionClinicaOsteomuscular es requerida',
    });

    const res = await POST(
      jsonRequest('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion', {
        idAtencion: 'AT-1001',
        evaluacion: { idAtencion: 'AT-1001' },
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('evaluacionClinicaOsteomuscular');
  });

  it('devuelve 500 cuando el caso de uso lanza', async () => {
    saveExecute.mockRejectedValue(new Error('boom'));

    const res = await POST(
      jsonRequest('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion', {
        idAtencion: 'AT-1001',
        evaluacion: {},
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'boom' });
  });
});

describe('GET /api/areas/musculoesqueletica/jjc/evaluacion', () => {
  it('devuelve 200 con la evaluación almacenada', async () => {
    loadExecute.mockResolvedValue({
      ok: true,
      data: { idAtencion: 'AT-1001', evaluacionClinicaOsteomuscular: {} },
      error: null,
    });

    const res = await GET(
      new Request('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion?idAtencion=AT-1001'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.idAtencion).toBe('AT-1001');
    expect(loadExecute).toHaveBeenCalledWith('AT-1001');
  });

  it('devuelve 404 cuando no hay evaluación guardada', async () => {
    loadExecute.mockResolvedValue({ ok: true, data: null, error: null });

    const res = await GET(
      new Request('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion?idAtencion=AT-9999'),
    );

    expect(res.status).toBe(404);
  });

  it('devuelve 400 cuando falta idAtencion', async () => {
    const res = await GET(
      new Request('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion'),
    );

    expect(res.status).toBe(400);
    expect(loadExecute).not.toHaveBeenCalled();
  });

  it('devuelve 500 cuando el caso de uso falla', async () => {
    loadExecute.mockResolvedValue({ ok: false, data: null, error: 'DB down' });

    const res = await GET(
      new Request('http://localhost/api/areas/musculoesqueletica/jjc/evaluacion?idAtencion=AT-1001'),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'DB down' });
  });
});
