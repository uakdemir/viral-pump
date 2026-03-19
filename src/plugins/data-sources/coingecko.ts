import type { DetectedEvent } from '../../domain/detected-event.js';
import type { DataSourceProvider } from './types.js';
import { logger } from '../../shared/logger.js';

interface CoinGeckoConfig {
  endpoint: string;
  assets: Record<string, string>;
  vsCurrencies: string[];
}

export class CoinGeckoProvider implements DataSourceProvider {
  private previousPrices = new Map<string, number>();
  private config: CoinGeckoConfig;

  constructor(config: CoinGeckoConfig) {
    this.config = config;
  }

  setPreviousPrice(instrument: string, price: number) {
    this.previousPrices.set(instrument, price);
  }

  async poll(verticalId: string): Promise<DetectedEvent[]> {
    try {
      const ids = Object.keys(this.config.assets).join(',');
      const vs = this.config.vsCurrencies.join(',');
      const url = `${this.config.endpoint}?ids=${ids}&vs_currencies=${vs}`;
      const res = await fetch(url);

      if (!res.ok) {
        logger.warn({ status: res.status, url }, 'CoinGecko API error');
        return [];
      }

      const data = await res.json() as Record<string, Record<string, number>>;
      const events: DetectedEvent[] = [];
      const now = new Date();

      for (const [assetId, symbol] of Object.entries(this.config.assets)) {
        for (const vs of this.config.vsCurrencies) {
          const price = data?.[assetId]?.[vs];
          if (typeof price !== 'number') continue;

          const instrument = `${symbol}/${vs.toUpperCase()}`;
          const previousPrice = this.previousPrices.get(instrument) ?? price;
          const changePct = previousPrice !== 0
            ? ((price - previousPrice) / previousPrice) * 100
            : 0;

          events.push({
            source: 'coingecko',
            type: 'price-update',
            verticalId,
            observedAt: now,
            data: {
              instrument,
              baseCurrency: symbol,
              quoteCurrency: vs.toUpperCase(),
              price,
              previousPrice,
              changePct,
            },
            rawPayload: data,
          });

          this.previousPrices.set(instrument, price);
        }
      }

      return events;
    } catch (err) {
      logger.error({ err }, 'CoinGecko poll failed');
      return [];
    }
  }
}
