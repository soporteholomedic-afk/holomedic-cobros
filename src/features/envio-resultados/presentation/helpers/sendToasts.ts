import { toast } from 'sonner';

const TOAST_ID = 'send-results';

export function showSendLoading(): void {
  toast.loading('Enviando correo...', {
    id: TOAST_ID,
  });
}

export function showSendSuccess(recipientCount: number): void {
  toast.success('Correo enviado correctamente', {
    id: TOAST_ID,
    description: `Los resultados han sido enviados a ${recipientCount} destinatario${recipientCount !== 1 ? 's' : ''}.`,
  });
}

export function showSendError(errorMessage: string): void {
  toast.error('Error al enviar el correo', {
    id: TOAST_ID,
    description: errorMessage,
    duration: 10000,
  });
}
