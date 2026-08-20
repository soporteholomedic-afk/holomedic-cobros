import { describe, it, expect, beforeEach, vi } from 'vitest';

// `resolveOutputDir` calls `fs.stat` on the particular root. Mock
// `node:fs.promises.stat` so the test never touches a real share.
const mockStat = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => {
  const promises = { stat: mockStat };
  return { promises, default: { promises } };
});

// Set the UNC base path deterministically so `path.win32.join` produces
// backslash-joined paths. Must run before the module under test
// evaluates its top-level `FILE_SERVER_BASE_PATH` constant.
vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
});

import { resolveOutputDir } from '../outputDirResolver';
import { buildOutputDir } from '../constants';

describe('resolveOutputDir', () => {
  beforeEach(() => {
    mockStat.mockReset();
  });

  it('returns the particular LEGAJOS path when the particular root exists', async () => {
    // The particular root (`<BASE>\<dni>\<dni>\<idAten>`) exists → write
    // to its LEGAJOS subfolder so the read fallback finds the PDFs. The
    // ruc argument is unreliable for particulars (SP yields "null"), so
    // it must NOT participate in the particular check.
    mockStat.mockResolvedValue({} as never);

    const result = await resolveOutputDir('null', '70005854', '0112168');

    expect(result).toBe('\\\\172.16.10.12\\sigla\\70005854\\70005854\\0112168\\LEGAJOS');
    expect(mockStat).toHaveBeenCalledWith('\\\\172.16.10.12\\sigla\\70005854\\70005854\\0112168');
  });

  it('returns the standard buildOutputDir when the particular root does not exist', async () => {
    // The particular root does NOT exist (stat rejects) → fall back to
    // the standard path (`<BASE>\<ruc>\<dni>\<idAten>\LEGAJOS`).
    mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await resolveOutputDir('20123456789', '12345678', '012110021');

    expect(result).toBe(buildOutputDir('20123456789', '12345678', '012110021'));
    expect(result).toBe('\\\\172.16.10.12\\sigla\\20123456789\\12345678\\012110021\\LEGAJOS');
  });
});