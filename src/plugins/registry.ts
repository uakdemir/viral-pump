export interface PluginRegistry<T> {
  register(name: string, factory: (config: any) => T): void;
  resolve(name: string, config: any): T;
  names(): string[];
}

export function createRegistry<T>(): PluginRegistry<T> {
  const factories = new Map<string, (config: any) => T>();

  return {
    register(name, factory) {
      factories.set(name, factory);
    },
    resolve(name, config) {
      const factory = factories.get(name);
      if (!factory) throw new Error(`Unknown plugin: ${name}`);
      return factory(config);
    },
    names() {
      return [...factories.keys()];
    },
  };
}
