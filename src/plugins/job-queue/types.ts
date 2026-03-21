export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export interface JobQueue {
  enqueue(
    type: string,
    payload: Record<string, unknown>,
    options?: {
      scheduledAt?: Date;
      maxAttempts?: number;
    },
  ): Promise<string>;

  dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null>;

  complete(jobId: string): Promise<void>;

  fail(jobId: string, error: unknown): Promise<void>;

  extendLease(jobId: string, leaseDurationMs: number): Promise<void>;
}
