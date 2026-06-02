import { describe, it, expect } from 'vitest';
import { POST } from '../route';

describe('POST /api/send-email', () => {
  it('debe aceptar un cuerpo JSON válido y devolver success: true', async () => {
    const request = new Request('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'cliente@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Email queued (skeleton)',
    });
  });

  it('debe devolver 400 si el campo "to" está ausente', async () => {
    const request = new Request('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing');
  });

  it('debe devolver 400 si el cuerpo no es JSON válido', async () => {
    const request = new Request('http://localhost:3000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
