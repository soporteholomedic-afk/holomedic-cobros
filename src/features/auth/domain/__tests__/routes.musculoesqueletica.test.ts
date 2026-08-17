import { describe, it, expect } from 'vitest';
import { permisoParaRuta } from '../routes';

describe('permisoParaRuta — musculoskeletal JJC prefix', () => {
  it('returns "jjc" for the page-3 evaluation route', () => {
    expect(permisoParaRuta('/areas/musculoesqueletica/jjc/12345/evaluacion/pagina3')).toBe('jjc');
  });

  it('returns "jjc" for the bare musculoskeletal JJC prefix', () => {
    expect(permisoParaRuta('/areas/musculoesqueletica/jjc')).toBe('jjc');
  });

  it('returns null for the musculoskeletal area outside the JJC prefix', () => {
    expect(permisoParaRuta('/areas/musculoesqueletica')).toBeNull();
  });

  it('returns "jjc" for the new PDF API prefix', () => {
    expect(permisoParaRuta('/api/areas/musculoesqueletica/jjc/12345/pdf')).toBe('jjc');
    expect(permisoParaRuta('/api/areas/musculoesqueletica/jjc')).toBe('jjc');
  });
});
