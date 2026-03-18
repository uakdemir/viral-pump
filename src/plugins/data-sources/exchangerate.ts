import type { DetectedEvent } from '../../domain/detected-event.js';
import type { DataSourceProvider } from './types.js';

interface ExchangeRateConfig {
  endpoint: string;
  base: string;
  symbols: string[];
}

export class ExchangeRateProvider implements DataSourceProvider {
  private previousRates = new Map<string, number>();
  private config: ExchangeRateConfig;

  constructor(config: ExchangeRateConfig) {
    this.config = config;
  }

  setPreviousRate(instrument: string, rate: number) {
    this.previousRates.set(instrument, rate);
  }

  async poll(): Promise<DetectedEvent[]> {
    try {
      const url = `${this.config.endpoint}?base=${this.config.base}&symbols=${this.config.symbols.join(',')}`;
      const res = await fetch(url);

      if (!res.ok) return [];

      const data = await res.json() as { rates?: Record<string, number> };
      const rates = data?.rates;
      if (!rates || typeof rates !== 'object') return [];

      const events: DetectedEvent[] = [];
      const now = new Date();

      for (const symbol of this.config.symbols) {
        const rate = rates[symbol];
        if (typeof rate !== 'number') continue;

        const instrument = `${this.config.base}/${symbol}`;
        const previousRate = this.previousRates.get(instrument) ?? rate;
        const changePct = previousRate !== 0
          ? ((rate - previousRate) / previousRate) * 100
          : 0;

        events.push({
          source: 'exchangerate',
          instrument,
          baseCurrency: this.config.base,
          quoteCurrency: symbol,
          price: rate,
          previousPrice: previousRate,
          changePct,
          observedAt: now,
          rawPayload: data as Record<string, unknown>,
        });

        this.previousRates.set(instrument, rate);
      }

      return events;
    } catch {
      return [];
    }
  }
}
