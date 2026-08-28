/**
 * Tests for `resolveFirmaPageData` (editor-firmas task 3.1).
 *
 * Spec `firma-correo` / "First visit pre-fill" + "Signature Editing":
 *  - First visit (no stored signature) → Nombre/Área/Correo pre-fill
 *    from the user record (correo null → ''), Teléfono/Anexo empty.
 *  - A stored signature WINS over the prefill on later visits.
 *  - Unknown area → 404 (`notFound: true` — the page calls `notFound()`).
 *
 * Mocking strategy: `getSession` is stubbed at the module boundary
 * (next/headers has no test seam); the two repositories are injected
 * through their REAL factory test seams (`__setUsuarioDbForTests`,
 * `__setFirmaDbForTests`) so no SQL Server connection is ever opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSession } from '@/lib/auth';
import { __setUsuarioDbForTests } from '@/features/auth/infrastructure/getUsuarioDb';
import type { IUsuarioRepository } from '@/features/auth/domain/ports';
import type { UsuarioRow } from '@/features/auth/domain/entities';
import { __setFirmaDbForTests } from '@/features/firma-correo/infrastructure/getFirmaDb';
import type { IFirmaRepository } from '@/features/firma-correo/domain/ports';
import type { FirmaCorreo } from '@/features/firma-correo/domain/entities';

import { resolveFirmaPageData } from '../resolveFirmaPageData';

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

const USUARIO_FIXTURE: UsuarioRow = {
  idUsuario: 'user-1',
  usuario: 'jdoe',
  nombre: 'Dr. Juan Doe',
  area: 'Medicina',
  correo: 'juan.doe@holomedic.pe',
  permisos: ['firma_correo'],
  contrasenaHash: 'hash',
  firma: null,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const STORED_FIRMA: FirmaCorreo = {
  nombre: 'Nombre Guardado',
  area: 'Área Guardada',
  correo: 'guardado@holomedic.pe',
  telefono: '999888777',
  anexo: '123',
};

function makeUsuarioRepo(usuario: UsuarioRow | null): IUsuarioRepository {
  return {
    getById: vi.fn().mockResolvedValue(usuario),
  } as unknown as IUsuarioRepository;
}

function makeFirmaRepo(firma: FirmaCorreo | null): IFirmaRepository {
  return {
    getOwnFirma: vi.fn().mockResolvedValue(firma),
    saveOwnFirma: vi.fn(),
  } as unknown as IFirmaRepository;
}

describe('resolveFirmaPageData', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
  });

  afterEach(() => {
    __setUsuarioDbForTests(null);
    __setFirmaDbForTests(null);
  });

  it('returns notFound for an unregistered area without touching any repository', async () => {
    const usuarioRepo = makeUsuarioRepo(USUARIO_FIXTURE);
    const firmaRepo = makeFirmaRepo(null);
    __setUsuarioDbForTests(usuarioRepo);
    __setFirmaDbForTests(firmaRepo);
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    // Use a name that is guaranteed never to be registered in AREA_CONFIGS —
    // 'valoraciones' became a real area after REQ-03 landed and broke this fixture.
    const result = await resolveFirmaPageData('area-que-no-existe');

    expect(result).toEqual({ notFound: true });
    expect(usuarioRepo.getById).not.toHaveBeenCalled();
    expect(firmaRepo.getOwnFirma).not.toHaveBeenCalled();
  });

  it('returns notFound when there is no session (proxy is the real gate — this is a crash guard)', async () => {
    const firmaRepo = makeFirmaRepo(null);
    __setFirmaDbForTests(firmaRepo);
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await resolveFirmaPageData('cobranza');

    expect(result).toEqual({ notFound: true });
    expect(firmaRepo.getOwnFirma).not.toHaveBeenCalled();
  });

  it('returns notFound when the session user no longer exists', async () => {
    __setUsuarioDbForTests(makeUsuarioRepo(null));
    __setFirmaDbForTests(makeFirmaRepo(null));
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    const result = await resolveFirmaPageData('cobranza');

    expect(result).toEqual({ notFound: true });
  });

  it('returns notFound when the session user is inactive', async () => {
    __setUsuarioDbForTests(
      makeUsuarioRepo({ ...USUARIO_FIXTURE, activo: false }),
    );
    __setFirmaDbForTests(makeFirmaRepo(null));
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    const result = await resolveFirmaPageData('cobranza');

    expect(result).toEqual({ notFound: true });
  });

  it('prefills from the user record on first visit (no stored firma) with telefono/anexo empty', async () => {
    __setUsuarioDbForTests(makeUsuarioRepo(USUARIO_FIXTURE));
    __setFirmaDbForTests(makeFirmaRepo(null));
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    const result = await resolveFirmaPageData('consolidados');

    expect(result).toEqual({
      notFound: false,
      initialFirma: {
        nombre: 'Dr. Juan Doe',
        area: 'Medicina',
        correo: 'juan.doe@holomedic.pe',
        telefono: '',
        anexo: '',
      },
    });
  });

  it('normalizes a null user correo to an empty string in the prefill', async () => {
    __setUsuarioDbForTests(
      makeUsuarioRepo({ ...USUARIO_FIXTURE, correo: null }),
    );
    __setFirmaDbForTests(makeFirmaRepo(null));
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    const result = await resolveFirmaPageData('cobranza');

    expect(result).toEqual({
      notFound: false,
      initialFirma: {
        nombre: 'Dr. Juan Doe',
        area: 'Medicina',
        correo: '',
        telefono: '',
        anexo: '',
      },
    });
  });

  it('a stored signature wins over the user-record prefill', async () => {
    const firmaRepo = makeFirmaRepo(STORED_FIRMA);
    __setUsuarioDbForTests(makeUsuarioRepo(USUARIO_FIXTURE));
    __setFirmaDbForTests(firmaRepo);
    vi.mocked(getSession).mockResolvedValue({
      sub: 'user-1',
      nombre: 'Dr. Juan Doe',
      area: 'Medicina',
      permisos: ['firma_correo'],
    });

    const result = await resolveFirmaPageData('cobranza');

    expect(result).toEqual({ notFound: false, initialFirma: STORED_FIRMA });
    expect(firmaRepo.getOwnFirma).toHaveBeenCalledWith('user-1');
  });
});
