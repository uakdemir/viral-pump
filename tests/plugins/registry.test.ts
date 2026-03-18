import { describe, it, expect } from 'vitest';
import { createRegistry } from '../../src/plugins/registry.js';

interface Greeter {
  greet(name: string): string;
}

describe('Plugin Registry', () => {
  it('resolves a registered implementation by name', () => {
    const registry = createRegistry<Greeter>();
    registry.register('hello', (config: any) => ({
      greet: (name: string) => `Hello ${name}, ${config.suffix}`,
    }));

    const greeter = registry.resolve('hello', { suffix: 'welcome!' });
    expect(greeter.greet('Umut')).toBe('Hello Umut, welcome!');
  });

  it('throws for unknown implementation', () => {
    const registry = createRegistry<Greeter>();
    expect(() => registry.resolve('unknown', {})).toThrow('Unknown plugin: unknown');
  });

  it('lists registered names', () => {
    const registry = createRegistry<Greeter>();
    registry.register('a', () => ({ greet: () => '' }));
    registry.register('b', () => ({ greet: () => '' }));
    expect(registry.names()).toEqual(['a', 'b']);
  });
});
