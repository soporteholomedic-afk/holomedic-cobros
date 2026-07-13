import { describe, expect, it } from 'vitest';
import { renameReadyFile } from '../renameReadyFile';

/**
 * PR envio-resultados CAMO/EMO wizard — WU-1.2.
 *
 * Behaviour change (spec REQ-010 + design §2 renameReadyFile):
 *   - Unify the format to use the hyphen separator:
 *       `{tipo}-{nombreCompleto}-{destino}.pdf`
 *   - Empty segments (after trim + sanitize) are OMITTED, not replaced
 *     with a fallback like `SIN_DESTINO`. If only `tipo` survives
 *     sanitization, the result is `{tipo}.pdf`.
 *   - When `tipoExamen` is provided, it overrides the tipo inferred
 *     from `parseReadyFile(rawName)`. When absent, the pipeline falls
 *     back to `parseReadyFile` (yields `'CAMO'` for `*CERT.pdf` and
 *     `'EMO'` for `*EXPED.pdf`).
 *   - Non-ready file names (anything `parseReadyFile` rejects) MUST be
 *     returned unchanged.
 *
 * Spec scenarios covered:
 *   S-016 — happy path, all three segments present
 *   S-017 — empty `nombreCompleto` is omitted (no error)
 *   S-018 — `tipoExamen` absent → `parseReadyFile` fallback (CERT→CAMO)
 *   plus the EXPED→EMO mirror and the `tipoExamen` override case.
 */
describe('renameReadyFile', () => {
  it('renames a CERT file to CAMO format with hyphen separator (S-016)', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN PEREZ',
      destino: 'METRO LIMA',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JUAN PEREZ-METRO LIMA.pdf');
  });

  it('renames an EXPED file to EMO format with hyphen separator', () => {
    const result = renameReadyFile({
      rawName: '012109975EXPED.pdf',
      nombreCompleto: 'MARIA GARCIA',
      destino: 'UNACEM',
      tipoExamen: 'EMO',
    });
    expect(result).toBe('EMO-MARIA GARCIA-UNACEM.pdf');
  });

  it('omits empty nombreCompleto segment → CAMO-METRO LIMA.pdf (S-017)', () => {
    // The legacy code returned the raw name when nombreCompleto was
    // empty. The new contract omits the empty segment instead so the
    // email attachment still carries a meaningful, prefixed name.
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '',
      destino: 'METRO LIMA',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-METRO LIMA.pdf');
  });

  it('omits whitespace-only nombreCompleto segment', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '   ',
      destino: 'METRO LIMA',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-METRO LIMA.pdf');
  });

  it('omits empty destino segment (no SIN_DESTINO fallback)', () => {
    // The previous contract emitted `CAMO_JUAN_SIN_DESTINO.pdf` for
    // this case. The new contract simply omits the empty segment.
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN',
      destino: '',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JUAN.pdf');
  });

  it('falls back to parseReadyFile when tipoExamen is absent (CERT → CAMO, S-018)', () => {
    // Legacy call sites (e.g. download routes) do not pass
    // `tipoExamen`. The pipeline MUST still produce a CAMO-prefixed
    // name by parsing the CERT suffix from the file name.
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'X',
      destino: 'Y',
    });
    expect(result).toBe('CAMO-X-Y.pdf');
  });

  it('falls back to parseReadyFile for EXPED → EMO when tipoExamen is absent', () => {
    const result = renameReadyFile({
      rawName: '012109975EXPED.pdf',
      nombreCompleto: 'X',
      destino: 'Y',
    });
    expect(result).toBe('EMO-X-Y.pdf');
  });

  it('uses tipoExamen="EMO" override even on a CERT file (parseReadyFile fallback bypassed)', () => {
    // The wizard might set tipoExamen explicitly. When the override is
    // present, it must win over the suffix-based fallback. (In
    // practice the wizard will pair the correct tipoExamen with the
    // correct file; this test pins down the contract for the
    // mismatch-recovery path.)
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'X',
      destino: 'Y',
      tipoExamen: 'EMO',
    });
    expect(result).toBe('EMO-X-Y.pdf');
  });

  it('returns the tipo only when every other segment is empty (CAMO.pdf)', () => {
    // Defensive: after trim+filter, only `tipo` survives. The format
    // never collapses to an empty string — it falls back to the bare
    // tipo file name.
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '',
      destino: '',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO.pdf');
  });

  it('does NOT rename a non-ready file', () => {
    const result = renameReadyFile({
      rawName: 'informe.pdf',
      nombreCompleto: 'JUAN',
      destino: 'DEST',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('informe.pdf');
  });

  it('does NOT rename a SiglaCLI file', () => {
    const result = renameReadyFile({
      rawName: '012110429_390417_CERTIFICADO APTITUD METRO LIMA 2.pdf',
      nombreCompleto: 'JUAN',
      destino: 'DEST',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('012110429_390417_CERTIFICADO APTITUD METRO LIMA 2.pdf');
  });

  it('sanitizes illegal characters in nombreCompleto', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN/PEREZ\\OTRO',
      destino: 'TEST',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JUAN_PEREZ_OTRO-TEST.pdf');
  });

  it('sanitizes illegal characters in destino', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JUAN',
      destino: 'UNACEM/CORP:LTD',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JUAN-UNACEM_CORP_LTD.pdf');
  });

  it('collapses whitespace runs and trims', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: '  JUAN   PEREZ  ',
      destino: '  UNACEM  ',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JUAN PEREZ-UNACEM.pdf');
  });

  it('handles accented and ñ characters in patient name', () => {
    const result = renameReadyFile({
      rawName: '75618561CERT.pdf',
      nombreCompleto: 'JOSÉ PEÑA',
      destino: 'CLÍNICA SANTA ISABEL',
      tipoExamen: 'CAMO',
    });
    expect(result).toBe('CAMO-JOSÉ PEÑA-CLÍNICA SANTA ISABEL.pdf');
  });
});
