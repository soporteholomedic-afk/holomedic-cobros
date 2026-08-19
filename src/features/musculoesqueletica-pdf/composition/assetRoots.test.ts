import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { FILE_SERVER_BASE_PATH } from '@/lib/platform';
import { buildFirmaHuellaRoots } from './assetRoots';
import { loadImageAsDataUri } from '../infrastructure/assets';

/** Temp dirs created by each test, removed in `afterEach`. */
const created: string[] = [];

function makeTempRoot(seed: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `firma-roots-${seed}-`));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('buildFirmaHuellaRoots', () => {
  it('defaults the first root to the platform file-server base', () => {
    const roots = buildFirmaHuellaRoots('/x/public');
    // The first root must be the share the SQL adapter maps patient paths into.
    expect(roots[0]).toBe(FILE_SERVER_BASE_PATH);
  });

  it('keeps the feature and public asset roots as local fallbacks', () => {
    const roots = buildFirmaHuellaRoots('/x/public');
    expect(roots).toContain(path.join('/x/public', 'musculoesqueletica-pdf', 'assets'));
    expect(roots).toContain(path.join('/x/public', 'assets'));
  });
});

describe('firma/huella image resolution through the composition roots', () => {
  it('loads a patient image that lives under the file-server base', () => {
    const serverRoot = makeTempRoot('server');
    const publicRoot = makeTempRoot('public');
    const patientFirma = path.join(serverRoot, '20556200328', '80630866', 'ORDEN_IMG', 'FIRMA.jpg');

    fs.mkdirSync(path.dirname(patientFirma), { recursive: true });
    fs.writeFileSync(patientFirma, Buffer.from('FIRMA-JPEG-BYTES'));

    const uri = loadImageAsDataUri(patientFirma, {
      baseDir: publicRoot,
      roots: buildFirmaHuellaRoots(publicRoot, serverRoot),
      allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
      maxBytes: 512 * 1024,
    });

    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from('FIRMA-JPEG-BYTES').toString('base64')}`);
  });

  it('refuses a file outside every allowed root', () => {
    const serverRoot = makeTempRoot('server');
    const publicRoot = makeTempRoot('public');
    const outside = path.join(publicRoot, '..', 'outside.jpg');
    const outsideAbs = path.resolve(outside);

    const uri = loadImageAsDataUri(outsideAbs, {
      baseDir: publicRoot,
      roots: buildFirmaHuellaRoots(publicRoot, serverRoot),
      allowedExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
      maxBytes: 512 * 1024,
    });

    expect(uri).toBeNull();
  });
});