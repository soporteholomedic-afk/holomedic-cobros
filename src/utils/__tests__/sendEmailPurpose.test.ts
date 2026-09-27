import { describe, expect, it } from 'vitest';

import type { Purpose } from '../sendEmail';

/**
 * Compile-time + runtime pin (rediseno-crm-panel task 3.3, design D5):
 * the SMTP purpose union carries the dedicated 'crm' arm so panel sends
 * resolve SMTP_USER_CRM / SMTP_PASS_CRM with no cross-purpose fallback
 * (the cobranza→facturacion fallback in resolveCredsWithFallback never
 * applies to 'crm'). The RED executor for this pin is `tsc --noEmit` —
 * the union is compile-only, vitest's transpiler erases types.
 */
describe('sendEmail Purpose union', () => {
  it("includes the dedicated 'crm' purpose alongside the existing three", () => {
    const propositos: Purpose[] = ['consolidados', 'facturacion', 'cobranza', 'crm'];

    expect(propositos).toHaveLength(4);
    expect(propositos.at(-1)).toBe('crm');
  });
});
