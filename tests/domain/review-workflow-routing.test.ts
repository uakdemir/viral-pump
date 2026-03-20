import { describe, it, expect } from 'vitest';
import { filterAccountsByCompatibility } from '../../src/domain/review-workflow.js';

describe('filterAccountsByCompatibility', () => {
  const accounts = [
    { id: '1', platform: 'twitter', status: 'active' },
    { id: '2', platform: 'instagram', status: 'active' },
    { id: '3', platform: 'tiktok', status: 'active' },
    { id: '4', platform: 'telegram', status: 'active' },
    { id: '5', platform: 'pinterest', status: 'active' },
  ];

  it('explicit platform filters to matching only', () => {
    const result = filterAccountsByCompatibility(accounts, 'twitter', 'image');
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('twitter');
  });

  it('NULL platform with image includes compatible platforms', () => {
    const result = filterAccountsByCompatibility(accounts, null, 'image');
    const platforms = result.map(a => a.platform);
    expect(platforms).toContain('twitter');
    expect(platforms).toContain('instagram');
    expect(platforms).toContain('pinterest');
    expect(platforms).toContain('telegram');
    expect(platforms).not.toContain('tiktok');
  });

  it('NULL platform with text-only excludes image-required platforms', () => {
    const result = filterAccountsByCompatibility(accounts, null, 'text-only');
    const platforms = result.map(a => a.platform);
    expect(platforms).toContain('twitter');
    expect(platforms).toContain('telegram');
    expect(platforms).not.toContain('instagram');
    expect(platforms).not.toContain('pinterest');
    expect(platforms).not.toContain('tiktok');
  });

  it('returns empty for unmatched explicit platform', () => {
    const result = filterAccountsByCompatibility(accounts, 'youtube', 'image');
    expect(result).toHaveLength(0);
  });

  it('returns empty when no compatible platforms', () => {
    const videoOnlyAccounts = [{ id: '1', platform: 'tiktok', status: 'active' }];
    const result = filterAccountsByCompatibility(videoOnlyAccounts, null, 'image');
    expect(result).toHaveLength(0);
  });
});
