import type { DetectedEvent } from '../../domain/detected-event.js';
import type { DataSourceProvider } from './types.js';
import { logger } from '../../shared/logger.js';

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

  async poll(verticalId: string): Promise<DetectedEvent[]> {
    try {
      // Supports both open.er-api.com (/v6/latest/USD) and exchangerate.host (?base=USD&symbols=...)
      const url = this.config.endpoint.includes('/v6/')
        ? `${this.config.endpoint}/${this.config.base}`
        : `${this.config.endpoint}?base=${this.config.base}&symbols=${this.config.symbols.join(',')}`;

      const res = await fetch(url);
      if (!res.ok) {
        logger.warn({ status: res.status, url }, 'Exchange rate API error');
        return [];
      }

      const data = (await res.json()) as { rates?: Record<string, number> };
      const rates = data?.rates;
      if (!rates || typeof rates !== 'object') {
        logger.warn(
          { data: JSON.stringify(data).slice(0, 200) },
          'Exchange rate API: no rates in response',
        );
        return [];
      }

      const events: DetectedEvent[] = [];
      const now = new Date();

      for (const symbol of this.config.symbols) {
        const rate = rates[symbol];
        if (typeof rate !== 'number') continue;

        const instrument = `${this.config.base}/${symbol}`;
        const previousRate = this.previousRates.get(instrument);
        const changePct =
          previousRate != null && previousRate !== 0
            ? ((rate - previousRate) / previousRate) * 100
            : 0;

        events.push({
          source: 'exchangerate',
          type: 'rate-update',
          verticalId,
          observedAt: now,
          data: {
            instrument,
            baseCurrency: this.config.base,
            quoteCurrency: symbol,
            price: rate,
            previousPrice: previousRate ?? rate,
            changePct,
          },
          rawPayload: data as Record<string, unknown>,
        });

        this.previousRates.set(instrument, rate);
      }

      return events;
    } catch (err) {
      logger.error({ err }, 'Exchange rate poll failed');
      return [];
    }
  }
}
