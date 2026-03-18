import type { DetectedEvent } from '../../domain/detected-event.js';

export interface DataSourceProvider {
  poll(): Promise<DetectedEvent[]>;
}
