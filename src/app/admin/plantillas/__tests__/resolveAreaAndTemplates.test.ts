import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted mock state ---
const mocks = vi.hoisted(() => ({
  areaConfig: null as unknown,
  templates: [] as unknown[],
}));

// Mock the areaConfigRegistry — controlled per test.
vi.mock('@/features/plantillas-editor/infrastructure/areaConfigRegistry', () => ({
  getAreaConfig: (area: string) => {
    if (area === 'consolidados') return mocks.areaConfig;
    return undefined;
  },
  AREA_CONFIGS: new Map(),
}));

// Mock getTemplateDb — returns a stub repo whose listByArea resolves to mocks.templates.
vi.mock('@/features/plantillas-editor/infrastructure/getTemplateDb', () => ({
  getTemplateDb: async () => ({
    listByArea: async () => mocks.templates,
  }),
}));

// Mock ListTemplatesUseCase so we can assert it's called with the right area.
const mockListActive = vi.hoisted(() => vi.fn());
vi.mock('@/features/plantillas-editor/application/listTemplates', () => ({
  ListTemplatesUseCase: class {
    listActive = mockListActive;
  },
}));

import { resolveAreaAndTemplates } from '../[area]/resolveAreaAndTemplates';
import type { AreaConfig } from '@/features/plantillas-editor/infrastructure/areaConfigRegistry';
import type { Template } from '@/features/plantillas-editor/domain/entities';

const consolidadosConfig: AreaConfig = {
  area: 'consolidados',
  label: 'Consolidados',
  availableTokens: [
    { category: 'Empresa', tokens: [{ key: 'empresa', label: 'Empresa' }] },
  ],
  predefinedTables: [],
  mockPreviewData: {
    companyName: 'X',
    patientNames: [],
    fileNames: [],
    firma: '',
    area: 'consolidados',
    today: '2026-01-01',
    pacienteDni: '12345678',
    pacienteNombre: 'Test Paciente',
    destino: 'Proyecto Test',
  },
};

function makeTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-1',
    area: 'consolidados',
    type: 'company',
    name: 'Welcome',
    subject: 'Hello {{empresa}}',
    bodyHtml: '<p>Hola {{empresa}}</p>',
    isDefault: false,
    currentVersionId: 'v-1',
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveAreaAndTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.areaConfig = consolidadosConfig;
    mocks.templates = [];
  });

  describe('spec scenario: Known area renders editor', () => {
    it('resolves the areaConfig for /admin/plantillas/consolidados', async () => {
      mockListActive.mockResolvedValue([]);
      const result = await resolveAreaAndTemplates('consolidados');
      expect(result.notFound).toBe(false);
      if (result.notFound) throw new Error('expected resolved');
      expect(result.areaConfig).toBe(consolidadosConfig);
    });

    it('forwards the initial templates list (resolved via getTemplateDb + listByArea)', async () => {
      mocks.templates = [makeTemplate({ id: 't1' }), makeTemplate({ id: 't2' })];
      mockListActive.mockResolvedValue(mocks.templates);
      const result = await resolveAreaAndTemplates('consolidados');
      expect(result.notFound).toBe(false);
      if (result.notFound) throw new Error('expected resolved');
      expect(result.templates).toEqual(mocks.templates);
    });

    it('forwards an empty templates list when the area has no templates yet (first-use empty list, spec: No seeding in the editor)', async () => {
      mocks.templates = [];
      mockListActive.mockResolvedValue([]);
      const result = await resolveAreaAndTemplates('consolidados');
      expect(result.notFound).toBe(false);
      if (result.notFound) throw new Error('expected resolved');
      expect(result.templates).toEqual([]);
    });

    it('calls ListTemplatesUseCase.listActive with the resolved area (not a hardcoded value)', async () => {
      mockListActive.mockResolvedValue([]);
      await resolveAreaAndTemplates('consolidados');
      expect(mockListActive).toHaveBeenCalledTimes(1);
      expect(mockListActive).toHaveBeenCalledWith('consolidados');
    });
  });

  describe('spec scenario: Unknown area returns 404', () => {
    it('returns notFound for an unknown area (not cobranza/valoraciones — those are reserved but unpopulated)', async () => {
      const result = await resolveAreaAndTemplates('unknown');
      expect(result).toEqual({ notFound: true });
    });

    it('returns notFound for a reserved-but-unpopulated area (cobranza)', async () => {
      const result = await resolveAreaAndTemplates('cobranza');
      expect(result).toEqual({ notFound: true });
    });

    it('returns notFound for a reserved-but-unpopulated area (valoraciones)', async () => {
      const result = await resolveAreaAndTemplates('valoraciones');
      expect(result).toEqual({ notFound: true });
    });

    it('does NOT call ListTemplatesUseCase when the area is unknown (avoids wasted DB work)', async () => {
      await resolveAreaAndTemplates('unknown');
      expect(mockListActive).not.toHaveBeenCalled();
    });
  });
});
