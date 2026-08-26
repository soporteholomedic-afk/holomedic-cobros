import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailBodyField } from '../EmailBodyField';

/** Controlled harness — the consumer owns the editing state. */
function Harness({ html, emptyHint = 'Sin cuerpo' }: { html: string; emptyHint?: string }) {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <EmailBodyField
      html={html}
      isEditing={isEditing}
      onEditingChange={setIsEditing}
      emptyHint={emptyHint}
      editorSlot={<div data-testid="editor-slot-stub" />}
      signatureSlot={<div data-testid="signature-slot-stub" />}
    />
  );
}

describe('EmailBodyField', () => {
  it('shows the sanitized body preview with an Editar button in preview mode', () => {
    render(<Harness html={'<p>Cuerpo del correo</p><script>alert(1)</script>'} />);
    const preview = screen.getByTestId('body-preview');
    expect(preview).toHaveTextContent('Cuerpo del correo');
    expect(preview.innerHTML).not.toContain('<script');
    expect(screen.getByText('Editar')).toBeInTheDocument();
    // Editor and signature stay unmounted in preview mode.
    expect(screen.queryByTestId('editor-slot-stub')).not.toBeInTheDocument();
    expect(screen.queryByTestId('signature-slot-stub')).not.toBeInTheDocument();
  });

  it('shows the empty hint when there is no body', () => {
    render(<Harness html="" emptyHint="Seleccione una plantilla" />);
    expect(screen.getByText('Seleccione una plantilla')).toBeInTheDocument();
    expect(screen.queryByTestId('body-preview')).not.toBeInTheDocument();
    expect(screen.queryByText('Editar')).not.toBeInTheDocument();
  });

  it('toggles into edit mode: editor slot + signature slot + Hecho', () => {
    render(<Harness html="<p>Cuerpo</p>" />);
    fireEvent.click(screen.getByText('Editar'));

    expect(screen.getByTestId('editor-slot-stub')).toBeInTheDocument();
    expect(screen.getByTestId('signature-slot-stub')).toBeInTheDocument();
    expect(screen.getByText('Hecho')).toBeInTheDocument();
    // Preview is replaced by the editor composition.
    expect(screen.queryByTestId('body-preview')).not.toBeInTheDocument();
  });

  it('toggles back to preview mode via Hecho', () => {
    render(<Harness html="<p>Cuerpo</p>" />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Hecho'));

    expect(screen.queryByTestId('editor-slot-stub')).not.toBeInTheDocument();
    expect(screen.getByTestId('body-preview')).toHaveTextContent('Cuerpo');
  });

  it('delegates the toggle intent through onEditingChange', () => {
    const onEditingChange = vi.fn();
    render(
      <EmailBodyField
        html="<p>Cuerpo</p>"
        isEditing={false}
        onEditingChange={onEditingChange}
        emptyHint="Sin cuerpo"
      />,
    );
    fireEvent.click(screen.getByText('Editar'));
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });
});
