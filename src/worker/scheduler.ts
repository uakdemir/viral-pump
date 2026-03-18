import { eq } from 'drizzle-orm';
import { dataSources } from '../shared/schema/data-sources.js';
import type { DB } from '../shared/db.js';
import type { DataSourceProvider } from '../plugins/data-sources/types.js';
import type { DetectedEvent } from '../domain/detected-event.js';
import { createRegistry, type PluginRegistry } from '../plugins/registry.js';
import { CoinGeckoProvider } from '../plugins/data-sources/coingecko.js';
import { ExchangeRateProvider } from '../plugins/data-sources/exchangerate.js';

export function createDataSourceRegistry(): PluginRegistry<DataSourceProvider> {
  const registry = createRegistry<DataSourceProvider>();
  registry.register('coingecko', (config) => new CoinGeckoProvider(config));
  registry.register('exchangerate', (config) => new ExchangeRateProvider(config));
  return registry;
}

interface SchedulerDeps {
  db: DB;
  registry: PluginRegistry<DataSourceProvider>;
  onEvents: (events: DetectedEvent[], verticalId: string) => Promise<void>;
  logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void };
}

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private providers = new Map<string, DataSourceProvider>();
  private deps: SchedulerDeps;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    const sources = await this.deps.db.select().from(dataSources)
      .where(eq(dataSources.status, 'active'));

    for (const source of sources) {
      const config = source.config as Record<string, unknown>;
      const provider = this.deps.registry.resolve(source.provider, config);
      this.providers.set(source.id, provider);

      this.deps.logger.info({ provider: source.provider, intervalMs: source.pollIntervalMs }, 'Starting data source polling');

      // Poll immediately, then on interval
      this.pollSource(source.id, source.verticalId, source.pollIntervalMs);
    }
  }

  private pollSource(sourceId: string, verticalId: string, intervalMs: number): void {
    const poll = async () => {
      try {
        const provider = this.providers.get(sourceId);
        if (!provider) return;

        const events = await provider.poll();

        if (events.length > 0) {
          await this.deps.onEvents(events, verticalId);
        }

        // Update last_polled_at
        await this.deps.db.update(dataSources)
          .set({ lastPolledAt: new Date() })
          .where(eq(dataSources.id, sourceId));
      } catch (err) {
        this.deps.logger.error({ err, sourceId }, 'Poll failed');
      }
    };

    poll(); // immediate first poll
    const timer = setInterval(poll, intervalMs);
    this.timers.set(sourceId, timer);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
}
