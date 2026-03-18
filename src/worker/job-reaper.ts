import { sql } from 'drizzle-orm';
import type { DB } from '../shared/db.js';

export class JobReaper {
  private timer: NodeJS.Timeout | undefined;
  private db: DB;
  private logger: { info: (...args: any[]) => void };

  constructor(db: DB, logger: { info: (...args: any[]) => void }) {
    this.db = db;
    this.logger = logger;
  }

  start(intervalMs: number = 60000): void {
    this.timer = setInterval(() => this.reap(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async reap(): Promise<void> {
    const result = await this.db.execute(sql`
      UPDATE job_queue
      SET status = 'pending',
          locked_by = NULL,
          locked_at = NULL,
          lease_expires_at = NULL
      WHERE status = 'processing'
        AND lease_expires_at < now()
    `);

    const count = (result as any).count ?? 0;
    if (count > 0) {
      this.logger.info({ count }, 'Reaped stale jobs');
    }
  }
}
