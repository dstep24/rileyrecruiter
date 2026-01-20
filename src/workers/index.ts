/**
 * Riley Recruiter - Background Workers
 *
 * Processes background jobs from the Redis queue:
 * - Task execution
 * - Inner loop runs
 * - Integration syncs
 * - Scheduled tasks
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/prisma.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

// Parse Redis URL
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
  };
}

const redisConfig = parseRedisUrl(REDIS_URL);

// =============================================================================
// WORKER PROCESSORS
// =============================================================================

interface TaskJobData {
  taskId: string;
  tenantId: string;
  taskType: string;
  payload: Record<string, unknown>;
}

async function processTask(job: Job<TaskJobData>): Promise<void> {
  const { taskId, tenantId, taskType } = job.data;

  console.log(`[Worker] Processing task ${taskId} (${taskType}) for tenant ${tenantId}`);

  try {
    // Task-specific processing would go here
    // For now, just log completion
    console.log(`[Worker] Completed task ${taskId}`);
  } catch (error) {
    console.error(`[Worker] Task ${taskId} failed:`, error);
    throw error;
  }
}

interface InnerLoopJobData {
  runId: string;
  tenantId: string;
  taskType: string;
  context: Record<string, unknown>;
}

async function processInnerLoop(job: Job<InnerLoopJobData>): Promise<void> {
  const { runId, tenantId, taskType } = job.data;

  console.log(`[Worker] Running inner loop ${runId} (${taskType}) for tenant ${tenantId}`);

  try {
    // Inner loop execution would go here
    console.log(`[Worker] Inner loop ${runId} completed`);
  } catch (error) {
    console.error(`[Worker] Inner loop ${runId} failed:`, error);
    throw error;
  }
}

interface SyncJobData {
  integration: string;
  tenantId: string;
  direction: 'push' | 'pull';
}

async function processSyncJob(job: Job<SyncJobData>): Promise<void> {
  const { integration, tenantId, direction } = job.data;

  console.log(`[Worker] Syncing ${integration} (${direction}) for tenant ${tenantId}`);

  try {
    // Integration sync would go here
    console.log(`[Worker] Sync completed for ${integration}`);
  } catch (error) {
    console.error(`[Worker] Sync failed for ${integration}:`, error);
    throw error;
  }
}

// =============================================================================
// WORKER SETUP
// =============================================================================

let workers: Worker[] = [];

async function startWorkers() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   Riley Recruiter - Background Workers                        ║
║   Concurrency: ${CONCURRENCY}                                              ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Connect to database
  console.log('Connecting to database...');
  await connectDatabase();

  // Task worker
  const taskWorker = new Worker(
    'tasks',
    async (job: Job) => {
      await processTask(job as Job<TaskJobData>);
    },
    {
      connection: redisConfig,
      concurrency: CONCURRENCY,
    }
  );

  taskWorker.on('completed', (job) => {
    console.log(`[Tasks] Job ${job.id} completed`);
  });

  taskWorker.on('failed', (job, err) => {
    console.error(`[Tasks] Job ${job?.id} failed:`, err.message);
  });

  workers.push(taskWorker);

  // Inner loop worker
  const innerLoopWorker = new Worker(
    'inner-loop',
    async (job: Job) => {
      await processInnerLoop(job as Job<InnerLoopJobData>);
    },
    {
      connection: redisConfig,
      concurrency: Math.ceil(CONCURRENCY / 2), // Inner loops are expensive
    }
  );

  innerLoopWorker.on('completed', (job) => {
    console.log(`[InnerLoop] Job ${job.id} completed`);
  });

  innerLoopWorker.on('failed', (job, err) => {
    console.error(`[InnerLoop] Job ${job?.id} failed:`, err.message);
  });

  workers.push(innerLoopWorker);

  // Sync worker
  const syncWorker = new Worker(
    'sync',
    async (job: Job) => {
      await processSyncJob(job as Job<SyncJobData>);
    },
    {
      connection: redisConfig,
      concurrency: 2, // Limit concurrent syncs
    }
  );

  syncWorker.on('completed', (job) => {
    console.log(`[Sync] Job ${job.id} completed`);
  });

  syncWorker.on('failed', (job, err) => {
    console.error(`[Sync] Job ${job?.id} failed:`, err.message);
  });

  workers.push(syncWorker);

  console.log(`Started ${workers.length} workers`);
  console.log('Workers ready, waiting for jobs...\n');
}

// =============================================================================
// SHUTDOWN
// =============================================================================

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down workers...`);

  // Close all workers
  await Promise.all(workers.map((w) => w.close()));
  console.log('Workers closed');

  // Disconnect database
  await disconnectDatabase();
  console.log('Database disconnected');

  console.log('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// =============================================================================
// RUN
// =============================================================================

startWorkers().catch((error) => {
  console.error('Failed to start workers:', error);
  process.exit(1);
});
