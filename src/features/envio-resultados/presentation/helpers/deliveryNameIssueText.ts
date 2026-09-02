import type { DeliveryNameIssue } from '../../domain/attachments/validateDeliveryName';

/**
 * Operator-facing reason text for a typed delivery-name issue (WU-5,
 * REQ-03). Shared by the composer's blocking error box and the red
 * rename chip so the wording never drifts between the two surfaces.
 *
 * UI copy is Spanish, matching the rest of the composer. The DUPLICATE
 * case names the colliding effective name; callers that already name
 * the file may not need it repeated here.
 */
export function deliveryNameIssueText(issue: DeliveryNameIssue): string {
  switch (issue.code) {
    case 'TRAVERSAL':
      return 'contiene caracteres de ruta no permitidos (.., /, \\)';
    case 'ILLEGAL_CHAR':
      return `contiene caracteres no permitidos: ${issue.chars}`;
    case 'TOO_LONG':
      return `supera el límite de 255 caracteres (longitud ${issue.length})`;
    case 'BAD_EXTENSION':
      return `debe terminar en .pdf (se recibió ${issue.got})`;
    case 'DUPLICATE':
      return 'está asignado a más de un archivo del envío';
  }
}
