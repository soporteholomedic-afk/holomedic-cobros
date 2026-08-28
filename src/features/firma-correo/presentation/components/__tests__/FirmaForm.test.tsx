/**
 * Tests for `FirmaForm` (editor-firmas task 3.6).
 *
 * Spec `firma-correo` / "Signature Editing" + "Field Validation":
 *  - Edit and persist → success feedback on save.
 *  - Invalid input → field-level errors, nothing persisted.
 *  - Live preview → send-time composition (`composeSignatureHtml` —
 *    the SAME pure function the send path uses), with every user
 *    value ESCAPED (spec "Escaping": `<b>X</b>` renders as text).
 *
 * `saveFirmaApi` is mocked at the module boundary; the component test
 * drives the hook's real logic (only the network is fake).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FirmaForm } from '../FirmaForm';
import type { FirmaCorreo } from '../../../domain/entities';

const saveFirmaApiMock = vi.hoisted(() => vi.fn());

vi.mock('../../helpers/saveFirmaApi', () => ({
  saveFirmaApi: saveFirmaApiMock,
}));

const INITIAL: FirmaCorreo = {
  nombre: 'Dr. Juan Doe',
  area: 'Medicina',
  correo: 'juan.doe@holomedic.pe',
  telefono: '999 888 777',
  anexo: '123',
};

describe('FirmaForm', () => {
  beforeEach(() => {
    saveFirmaApiMock.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders the five fields prefilled with the resolved initial values', () => {
    render(<FirmaForm initialFirma={INITIAL} />);

    // Regex matchers: the optional fields' accessible names carry an
    // "(Opcional)" hint span after the label text.
    expect(screen.getByLabelText('Nombre')).toHaveValue('Dr. Juan Doe');
    expect(screen.getByLabelText('Área')).toHaveValue('Medicina');
    expect(screen.getByLabelText('Correo')).toHaveValue('juan.doe@holomedic.pe');
    expect(screen.getByLabelText(/Móvil/)).toHaveValue('999 888 777');
    expect(screen.getByLabelText(/Anexo/)).toHaveValue('123');
  });

  it('live preview renders the composed signature and updates as fields change', () => {
    render(<FirmaForm initialFirma={INITIAL} />);

    const preview = screen.getByTestId('firma-preview');
    expect(preview.innerHTML).toContain('Dr. Juan Doe');
    expect(preview.innerHTML).toContain('<strong>Dr. Juan Doe</strong> | Área Medicina');
    // Correo renders as plain text — the composer emits no anchor.
    expect(preview.innerHTML).toContain('juan.doe@holomedic.pe');
    expect(preview.querySelector('a')).toBeNull();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Dra. Ana Poe' } });

    expect(preview.innerHTML).toContain('Dra. Ana Poe');
    expect(preview.innerHTML).not.toContain('Dr. Juan Doe');
  });

  it('resolves the logo cid to the public path for DISPLAY in the preview', () => {
    render(<FirmaForm initialFirma={INITIAL} />);

    const preview = screen.getByTestId('firma-preview');
    const logo = preview.querySelector('img');
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute('src', '/logo-holomedic.png');
    // The cid never reaches the rendered preview markup.
    expect(preview.innerHTML).not.toContain('cid:holomedic-logo');
  });

  it('renders the FIXED company phone and address even when optional fields are empty', () => {
    render(<FirmaForm initialFirma={{ ...INITIAL, telefono: '', anexo: '' }} />);

    const html = screen.getByTestId('firma-preview').innerHTML;
    expect(html).not.toContain('Móvil:');
    expect(html).not.toContain('Anexo:');
    expect(html).toContain('Telef. 480-0217');
    expect(html).toContain(
      'Pasaje La India 169, Urb. Los Sauces – Surquillo (Altura de 9 y 10 de la Av. Villarán)',
    );
  });


  it('escapes markup typed into the fields (preview shows text, never renders it)', () => {
    render(
      <FirmaForm
        initialFirma={{ ...INITIAL, nombre: '<b>X</b>', correo: 'x@holomedic.pe' }}
      />,
    );

    const preview = screen.getByTestId('firma-preview');
    expect(preview.innerHTML).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(preview.querySelector('b')).toBeNull();
  });

  it('omits the Móvil/Anexo segments from the preview when both are empty', () => {
    render(<FirmaForm initialFirma={{ ...INITIAL, telefono: '', anexo: '' }} />);

    expect(screen.getByTestId('firma-preview').innerHTML).not.toContain('Anexo:');
  });

  it('an invalid submit shows the field error and does NOT call the API', async () => {
    render(<FirmaForm initialFirma={INITIAL} />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

    expect(await screen.findByText('El correo no tiene un formato válido.')).toBeInTheDocument();
    expect(saveFirmaApiMock).not.toHaveBeenCalled();
  });

  it('a valid submit persists through the API and shows success feedback', async () => {
    saveFirmaApiMock.mockResolvedValue({
      ok: true,
      firma: INITIAL,
      firmaHtml: '<table>…</table>',
    });
    render(<FirmaForm initialFirma={INITIAL} />);

    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Firma guardada correctamente.');
    await waitFor(() =>
      expect(saveFirmaApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Dr. Juan Doe', correo: 'juan.doe@holomedic.pe' }),
      ),
    );
  });
});
