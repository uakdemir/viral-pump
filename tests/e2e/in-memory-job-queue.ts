import type { Job, JobQueue } from '../../src/plugins/job-queue/types.js';
import { randomUUID } from 'crypto';

interface StoredJob extends Job {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledAt: Date;
  leaseExpiresAt?: Date;
  lockedBy?: string;
  error?: unknown;
}

export class InMemoryJobQueue implements JobQueue {
  private jobs: StoredJob[] = [];

  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    options?: { scheduledAt?: Date; maxAttempts?: number },
  ): Promise<string> {
    const id = randomUUID();
    this.jobs.push({
      id,
      type,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      status: 'pending',
      scheduledAt: options?.scheduledAt ?? new Date(),
    });
    return id;
  }

  async dequeue(workerId: string, leaseDurationMs: number): Promise<Job | null> {
    const now = new Date();
    const job = this.jobs.find(j => j.status === 'pending' && j.scheduledAt <= now);
    if (!job) return null;

    job.status = 'processing';
    job.lockedBy = workerId;
    job.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    job.attempts++;

    return {
      id: job.id,
      type: job.type,
      payload: job.payload,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    };
  }

  async complete(jobId: string): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) job.status = 'completed';
  }

  async fail(jobId: string, error: unknown): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return;
    job.error = error;
    job.status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
    job.lockedBy = undefined;
    job.leaseExpiresAt = undefined;
  }

  async extendLease(jobId: string, leaseDurationMs: number): Promise<void> {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
    }
  }

  // Test helpers — not part of JobQueue interface
  getAll(): StoredJob[] {
    return [...this.jobs];
  }

  getByType(type: string): StoredJob[] {
    return this.jobs.filter(j => j.type === type);
  }

  getPending(): StoredJob[] {
    return this.jobs.filter(j => j.status === 'pending');
  }

  clear(): void {
    this.jobs = [];
  }
}
