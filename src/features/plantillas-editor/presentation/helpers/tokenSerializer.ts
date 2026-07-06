import type { TokenAttrs } from '../../domain/entities';

/**
 * Serialize a `TokenAttrs` chip into its `{{token}}` Mustache placeholder —
 * the storage format for both `bodyHtml` and `subject`.
 *
 * - Simple token: `{ key: 'empresa' }` → `{{empresa}}`
 * - Table token:  `{ key: 'tabla', table: 'documentosVencidos', cols: ['fecha','monto'] }`
 *   → `{{tabla:documentosVencidos:fecha,monto}}`
 *
 * The column order is SIGNIFICANT — `cols` is joined in array order so the
 * user's selection order is preserved through save → load round-trips.
 *
 * A `key: 'tabla'` WITHOUT a `table` field degrades to the simple form
 * (`{{tabla}}`) rather than throwing: the editor never produces that shape,
 * but the serializer is defensive so a malformed attrs object cannot crash
 * the save pipeline.
 *
 * Pure: no side effects, no BlockNote dependency. This is the foundation of
 * the editor's save pipeline (design Decision c) and is round-trip-tested
 * alongside `parseTokenPlaceholder` (task 3.5).
 */
export function encodeToken(attrs: TokenAttrs): string {
  const { key, table, cols } = attrs;
  if (typeof table === 'string' && table.length > 0) {
    const colsPart = Array.isArray(cols) ? cols.join(',') : '';
    return `{{${key}:${table}:${colsPart}}}`;
  }
  return `{{${key}}}`;
}
