import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmailPreviewPanel } from '../EmailPreviewPanel';
import { EmailControlsPanel } from '../EmailControlsPanel';
import type { EmailControlsPanelProps } from '../types';

describe('two-panel composition', () => {
  it('renders the preview panel LEFT of the controls panel in DOM order', () => {
    render(
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EmailPreviewPanel subject="Asunto" html="<p>body</p>" emptyHint="sin cuerpo" />
        <EmailControlsPanel
          to=""
          onToChange={vi.fn()}
          cc=""
          onCcChange={vi.fn()}
          subject=""
          onSubjectChange={vi.fn()}
          templateSlot={<div data-testid="template-slot" />}
          bodySlot={<div data-testid="body-slot" />}
          onSend={vi.fn()}
          sendDisabled={false}
          sending={false}
        />
      </div>,
    );

    const preview = screen.getByTestId('email-preview');
    const controls = screen.getByTestId('email-controls-panel');
    // Preview precedes controls in document order (LEFT / RIGHT).
    expect(
      preview.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('updates the live preview in place (no remount) when html changes', () => {
    const { rerender } = render(
      <EmailPreviewPanel subject="Asunto" html="<p>primera versión</p>" emptyHint="sin cuerpo" />,
    );

    const before = screen.getByTestId('email-preview');
    expect(before).toHaveTextContent('primera versión');

    rerender(
      <EmailPreviewPanel subject="Asunto nuevo" html="<p>segunda versión</p>" emptyHint="sin cuerpo" />,
    );

    const after = screen.getByTestId('email-preview');
    // Same DOM node — the preview updated without remounting.
    expect(after).toBe(before);
    expect(after).toHaveTextContent('segunda versión');
    expect(screen.getByText('Asunto nuevo')).toBeInTheDocument();
  });

  it('sanitizes hostile markup before rendering the preview', () => {
    render(
      <EmailPreviewPanel
        subject="Asunto"
        html='<p>seguro</p><script>alert("xss")</script><img src="x.png" onerror="alert(1)" />'
        emptyHint="sin cuerpo"
      />,
    );

    const preview = screen.getByTestId('email-preview');
    expect(preview.innerHTML).toContain('<p>seguro</p>');
    expect(preview.innerHTML).not.toContain('<script');
    expect(preview.innerHTML).not.toContain('onerror');
  });

  it('shows the empty hint instead of the preview when html is empty', () => {
    render(<EmailPreviewPanel subject="" html="" emptyHint="Seleccione una plantilla" />);
    expect(screen.getByText('Seleccione una plantilla')).toBeInTheDocument();
    expect(screen.queryByTestId('email-preview')).not.toBeInTheDocument();
  });

  it('renders template name footer and both slots', () => {
    render(
      <EmailPreviewPanel
        subject="Asunto"
        html="<p>cuerpo</p>"
        emptyHint="sin cuerpo"
        templateName="Recordatorio de pago"
        attachmentsSlot={<div data-testid="attachments-slot" />}
        dropZoneSlot={<div data-testid="dropzone-slot" />}
      />,
    );

    // The footer renders "Plantilla: <span>{name}</span>" — assert the
    // composed text of the footer container (text is split across nodes).
    const templateNameNode = screen.getByText('Recordatorio de pago');
    expect(templateNameNode.parentElement).toHaveTextContent('Plantilla: Recordatorio de pago');
    // Slot order: attachments before drop zone (document order).
    const attachments = screen.getByTestId('attachments-slot');
    const dropZone = screen.getByTestId('dropzone-slot');
    expect(
      attachments.compareDocumentPosition(dropZone) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('EmailControlsPanel', () => {
  function makeProps(overrides: Partial<EmailControlsPanelProps> = {}): EmailControlsPanelProps {
    return {
      to: '',
      onToChange: vi.fn(),
      cc: '',
      onCcChange: vi.fn(),
      subject: '',
      onSubjectChange: vi.fn(),
      templateSlot: <div data-testid="template-slot" />,
      bodySlot: <div data-testid="body-slot" />,
      onSend: vi.fn(),
      sendDisabled: false,
      sending: false,
      ...overrides,
    };
  }

  function renderControls(overrides: Partial<EmailControlsPanelProps> = {}) {
    const props = makeProps(overrides);
    return { props, ...render(<EmailControlsPanel {...props} />) };
  }

  it('delegates Destinatario, CC and Asunto edits to the callbacks', () => {
    const onToChange = vi.fn();
    const onCcChange = vi.fn();
    const onSubjectChange = vi.fn();
    renderControls({ onToChange, onCcChange, onSubjectChange });

    fireEvent.change(screen.getByLabelText('Destinatario'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('CC'), { target: { value: 'cc@b.com' } });
    fireEvent.change(screen.getByLabelText('Asunto'), { target: { value: 'Nuevo asunto' } });

    expect(onToChange).toHaveBeenCalledWith('a@b.com');
    expect(onCcChange).toHaveBeenCalledWith('cc@b.com');
    expect(onSubjectChange).toHaveBeenCalledWith('Nuevo asunto');
  });

  it('fires onSend with the composer state and performs no network I/O', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Harness composer: state lives above the panel, onSend closes over it.
    function Composer() {
      const [to, setTo] = useState('');
      const [subject, setSubject] = useState('');
      const [sent, setSent] = useState<{ to: string; subject: string } | null>(null);
      return (
        <div>
          <EmailControlsPanel
            to={to}
            onToChange={setTo}
            cc=""
            onCcChange={vi.fn()}
            subject={subject}
            onSubjectChange={setSubject}
            templateSlot={<div />}
            bodySlot={<div />}
            onSend={() => setSent({ to, subject })}
            sendDisabled={false}
            sending={false}
          />
          {sent && <div data-testid="sent-payload">{`${sent.to}|${sent.subject}`}</div>}
        </div>
      );
    }

    render(<Composer />);
    fireEvent.change(screen.getByLabelText('Destinatario'), { target: { value: 'cliente@corp.com' } });
    fireEvent.change(screen.getByLabelText('Asunto'), { target: { value: 'Estado de cuenta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByTestId('sent-payload')).toHaveTextContent('cliente@corp.com|Estado de cuenta');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('disables Enviar when sendDisabled or sending', () => {
    const { rerender } = renderControls({ sendDisabled: true });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    rerender(<EmailControlsPanel {...makeProps({ sendDisabled: false, sending: true })} />);
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  });

  it('renders the header, template and body slots', () => {
    renderControls({
      headerSlot: <button type="button" data-testid="panel-header-action">Volver</button>,
    });
    expect(screen.getByTestId('panel-header-action')).toBeInTheDocument();
    expect(screen.getByTestId('template-slot')).toBeInTheDocument();
    expect(screen.getByTestId('body-slot')).toBeInTheDocument();
  });
});
