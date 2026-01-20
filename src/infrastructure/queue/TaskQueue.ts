/**
 * Task Queue - BullMQ-based job processing
 *
 * Handles async task execution for Riley:
 * - Inner loop runs
 * - Effectful task execution
 * - Integration syncs
 * - Notifications
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

type RedisClient = IORedis;

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface QueueConfig {
  redisUrl: string;
  prefix: string;
}

const DEFAULT_CONFIG: QueueConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  prefix: 'riley',
};

// =============================================================================
// QUEUE NAMES
// =============================================================================

export const QUEUE_NAMES = {
  INNER_LOOP: 'inner-loop',
  TASK_EXECUTION: 'task-execution',
  INTEGRATION_SYNC: 'integration-sync',
  NOTIFICATIONS: 'notifications',
  SCHEDULED: 'scheduled',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// =============================================================================
// JOB DATA TYPES
// =============================================================================

export interface InnerLoopJobData {
  type: 'inner-loop';
  tenantId: string;
  taskType?: string;
  taskId?: string;
  context?: Record<string, unknown>;
  config?: Record<string, unknown>;
  // For feedback processing
  subtype?: 'guidelines-feedback' | 'criteria-feedback';
  feedback?: string;
  decisionType?: string;
}

export interface TaskExecutionJobData {
  type: 'task-execution';
  tenantId: string;
  taskId: string;
}

export interface IntegrationSyncJobData {
  type: 'integration-sync';
  tenantId: string;
  integrationId: string;
  syncType: 'full' | 'incremental';
}

export interface NotificationJobData {
  type: 'notification';
  tenantId: string;
  channel: 'slack' | 'email' | 'dashboard';
  payload: Record<string, unknown>;
}

export interface ScheduledJobData {
  type: 'scheduled';
  tenantId: string;
  scheduledTaskId: string;
  originalJobType: string;
  originalJobData: Record<string, unknown>;
}

export type JobData =
  | InnerLoopJobData
  | TaskExecutionJobData
  | IntegrationSyncJobData
  | NotificationJobData
  | ScheduledJobData;

// =============================================================================
// JOB OPTIONS
// =============================================================================

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

// =============================================================================
// QUEUE MANAGER
// =============================================================================

export class QueueManager {
  private config: QueueConfig;
  private connection: ConnectionOptions;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Parse Redis URL for BullMQ connection
    const redisUrl = new URL(this.config.redisUrl);
    this.connection = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port || '6379'),
      password: redisUrl.password || undefined,
    };
  }

  /**
   * Get or create a queue
   */
  getQueue(name: QueueName): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: this.connection,
        prefix: this.config.prefix,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, queue);
    }
    return this.queues.get(name)!;
  }

  /**
   * Add a job to a queue
   */
  async addJob(
    queueName: QueueName,
    data: JobData,
    options: JobOptions = {}
  ): Promise<Job<JobData>> {
    const queue = this.getQueue(queueName);
    const jobName = `${data.type}:${data.tenantId}`;

    return queue.add(jobName, data, {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    });
  }

  /**
   * Add multiple jobs to a queue
   */
  async addBulk(
    queueName: QueueName,
    jobs: Array<{ data: JobData; options?: JobOptions }>
  ): Promise<Job<JobData>[]> {
    const queue = this.getQueue(queueName);

    const bulkJobs = jobs.map(({ data, options }) => ({
      name: `${data.type}:${data.tenantId}`,
      data,
      opts: { ...DEFAULT_JOB_OPTIONS, ...options },
    }));

    return queue.addBulk(bulkJobs);
  }

  /**
   * Schedule a job for later execution
   */
  async scheduleJob(
    queueName: QueueName,
    data: JobData,
    runAt: Date,
    options: JobOptions = {}
  ): Promise<Job<JobData>> {
    const delay = runAt.getTime() - Date.now();

    if (delay < 0) {
      throw new Error('Cannot schedule job in the past');
    }

    return this.addJob(queueName, data, {
      ...options,
      delay,
    });
  }

  /**
   * Register a worker for a queue
   */
  registerWorker(
    queueName: QueueName,
    processor: (job: Job<JobData>) => Promise<unknown>,
    concurrency = 5
  ): Worker {
    if (this.workers.has(queueName)) {
      throw new Error(`Worker already registered for queue: ${queueName}`);
    }

    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      prefix: this.config.prefix,
      concurrency,
    });

    // Set up event handlers
    worker.on('completed', (job) => {
      console.log(`Job ${job.id} completed in queue ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed in queue ${queueName}:`, err);
    });

    worker.on('error', (err) => {
      console.error(`Worker error in queue ${queueName}:`, err);
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  /**
   * Get queue events for monitoring
   */
  getQueueEvents(queueName: QueueName): QueueEvents {
    if (!this.queueEvents.has(queueName)) {
      const events = new QueueEvents(queueName, {
        connection: this.connection,
        prefix: this.config.prefix,
      });
      this.queueEvents.set(queueName, events);
    }
    return this.queueEvents.get(queueName)!;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    const queue = this.getQueue(queueName);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<QueueStats[]> {
    const queueNames = Object.values(QUEUE_NAMES);
    return Promise.all(queueNames.map((name) => this.getQueueStats(name)));
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  /**
   * Clean up old jobs
   */
  async cleanQueue(
    queueName: QueueName,
    grace: number = 24 * 60 * 60 * 1000 // 24 hours
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await Promise.all([
      queue.clean(grace, 1000, 'completed'),
      queue.clean(grace, 1000, 'failed'),
    ]);
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const worker of this.workers.values()) {
      closePromises.push(worker.close());
    }

    for (const queue of this.queues.values()) {
      closePromises.push(queue.close());
    }

    for (const events of this.queueEvents.values()) {
      closePromises.push(events.close());
    }

    await Promise.all(closePromises);

    this.workers.clear();
    this.queues.clear();
    this.queueEvents.clear();
  }
}

// =============================================================================
// QUEUE STATS TYPE
// =============================================================================

export interface QueueStats {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let queueManagerInstance: QueueManager | null = null;

export function getQueueManager(config?: Partial<QueueConfig>): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager(config);
  }
  return queueManagerInstance;
}

export function resetQueueManager(): void {
  if (queueManagerInstance) {
    queueManagerInstance.close();
    queueManagerInstance = null;
  }
}

// =============================================================================
// REDIS CLIENT FOR DIRECT ACCESS
// =============================================================================

let redisClient: RedisClient | null = null;

export function getRedisClient(url?: string): RedisClient {
  if (!redisClient) {
    redisClient = new IORedis(url || process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
