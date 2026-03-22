import { describe, it, expect } from 'vitest';
import { resolveTemplates } from '../../src/domain/template-resolver.js';

const makeTemplate = (name: string) => ({
  id: `id-${name}`,
  name,
  verticalId: 'v1',
  category: 'alert',
  contentLayer: 'text+image',
  platform: null,
  promptTemplate: 'test',
  visualTemplate: {},
  platformMeta: {},
  generationConfig: {},
  tags: [],
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('resolveTemplates', () => {
  it('returns selected templates when all names found (named mode)', () => {
    const templates = [makeTemplate('a'), makeTemplate('b'), makeTemplate('c')];
    const result = resolveTemplates(
      { templateNames: ['a', 'b'], templateSelection: 'named' },
      templates,
    );
    expect(result).toEqual({
      ok: true,
      selectedTemplates: [templates[0], templates[1]],
    });
  });

  it('returns one random template when selection is RANDOM', () => {
    const templates = [makeTemplate('a'), makeTemplate('b')];
    const result = resolveTemplates(
      { templateNames: ['a', 'b'], templateSelection: 'random' },
      templates,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedTemplates).toHaveLength(1);
      expect(['a', 'b']).toContain(result.selectedTemplates[0].name);
    }
  });

  it('returns missing-templates error when configured names not found', () => {
    const templates = [makeTemplate('a')];
    const result = resolveTemplates(
      { templateNames: ['a', 'missing'], templateSelection: 'named' },
      templates,
    );
    expect(result).toEqual({
      ok: false,
      reason: 'missing-templates',
      missingNames: ['missing'],
    });
  });

  it('returns invalid-content-config when contentConfig is invalid', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveTemplates(null as any, []);
    expect(result).toEqual({ ok: false, reason: 'invalid-content-config' });
  });

  it('returns invalid-content-config when templateNames is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = resolveTemplates({ templateSelection: 'named' } as any, []);
    expect(result).toEqual({ ok: false, reason: 'invalid-content-config' });
  });

  it('returns all resolved templates when selection is not RANDOM', () => {
    const templates = [makeTemplate('x'), makeTemplate('y')];
    const result = resolveTemplates(
      { templateNames: ['x', 'y'], templateSelection: 'named' },
      templates,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedTemplates).toHaveLength(2);
    }
  });
});
