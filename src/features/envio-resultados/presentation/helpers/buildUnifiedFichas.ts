import type { UnifiedFicha } from '@/types/sp-result';
import { numOrdKey } from './resolveMatchingOrder';

/**
 * Worker-side input: SP_RPT_MATRIZICCGSA display fields (deduplicated and
 * normalized by the caller) plus the raw `NumOrd` used for correlation
 * (`null` tolerated from raw SQL/JSON drivers).
 */
interface FichaWorkerInput {
  proyecto: string;
  tipoExamen: string;
  condic: string;
  numOrd?: number | string | null;
}

/**
 * Order-side input: SP_SEL_ORDEN fields (`fecAte` already normalized by the
 * caller) plus the raw `NumOrd` used for correlation.
 */
interface FichaOrderInput {
  idAten: string;
  nroRuc: string;
  nomCFa: string;
  fecAte: string;
  numOrd?: number | string | null;
}

/**
 * Build the `UnifiedFicha[]` for ONE person by pairing that person's worker
 * rows with their order rows (design D1).
 *
 * Matching precedence:
 *  1. Each worker carrying a `NumOrd` key claims the FIRST unconsumed order
 *     with an equal key (trimmed-string compare via `numOrdKey`, so
 *     `number`/`string`/whitespace variants all match).
 *  2. Unpaired workers — keyless OR carrying a key that matched nothing —
 *     take the FIRST unconsumed order in array order. The positional
 *     fallback preserves ficha cardinality (unlike `resolveMatchingOrder`,
 *     which returns `undefined` for an unmatched explicit key: here a
 *     dropped ficha would silently hide an atención from the operator).
 *  3. Leftover orders append as pure-order fichas (worker fields empty).
 *
 * With zero `NumOrd` keys present this is byte-identical to the previous
 * positional zip in `useUnifiedResults` (spec S-101.2/S-101.3). The legacy
 * cardinality formula is preserved verbatim — including its quirk that a
 * lone worker with no orders yields ZERO fichas.
 */
export function buildUnifiedFichas(
  workers: readonly FichaWorkerInput[],
  orders: readonly FichaOrderInput[],
): UnifiedFicha[] {
  const consumed = new Array<boolean>(orders.length).fill(false);
  // Index of the order paired with each worker, or `undefined` while unpaired.
  const orderForWorker: (number | undefined)[] = new Array(workers.length).fill(undefined);

  // Pass 1: keyed workers claim the first unconsumed order with an equal key.
  for (let w = 0; w < workers.length; w++) {
    const key = numOrdKey(workers[w].numOrd);
    if (key === undefined) continue;
    for (let o = 0; o < orders.length; o++) {
      if (consumed[o]) continue;
      if (numOrdKey(orders[o].numOrd) === key) {
        orderForWorker[w] = o;
        consumed[o] = true;
        break;
      }
    }
  }

  // Pass 2: unpaired workers take the first unconsumed order (positional
  // fallback). An unmatched key degrades to this instead of dropping data.
  for (let w = 0; w < workers.length; w++) {
    if (orderForWorker[w] !== undefined) continue;
    const o = consumed.findIndex((isConsumed) => !isConsumed);
    if (o === -1) break;
    orderForWorker[w] = o;
    consumed[o] = true;
  }

  // Fichas in worker order, each carrying its paired order's fields.
  const fichas: UnifiedFicha[] = workers.map((worker, w) => {
    const orderIndex = orderForWorker[w];
    const order = orderIndex === undefined ? undefined : orders[orderIndex];
    return {
      idAten: order?.idAten ?? '',
      nroRuc: order?.nroRuc ?? '',
      nomCFa: order?.nomCFa ?? '',
      proyecto: worker.proyecto,
      tipoExamen: worker.tipoExamen,
      condic: worker.condic,
      fecAte: order?.fecAte ?? '',
    };
  });

  // Pass 3: leftover orders append as pure-order fichas.
  for (let o = 0; o < orders.length; o++) {
    if (consumed[o]) continue;
    fichas.push({
      idAten: orders[o].idAten,
      nroRuc: orders[o].nroRuc,
      nomCFa: orders[o].nomCFa,
      proyecto: '',
      tipoExamen: '',
      condic: '',
      fecAte: orders[o].fecAte,
    });
  }

  // Legacy cardinality formula, kept verbatim from the previous positional
  // zip so existing outputs stay byte-identical (notably: one worker + zero
  // orders → zero fichas).
  const workerCountForFichas = workers.length > 1 ? workers.length : 0;
  const fichasCount = Math.max(orders.length, workerCountForFichas);
  return fichas.slice(0, fichasCount);
}
