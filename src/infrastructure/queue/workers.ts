/**
 * Queue Workers
 *
 * Registers and initializes all BullMQ workers for background job processing.
 * Workers are responsible for:
 * - Follow-up message processing
 * - Pitch delivery (delayed)
 * - Notification delivery
 */

import { Job } from 'bullmq';
import { Redis } from 'ioredis';
import { getQueueManager, QUEUE_NAMES, JobData, ScheduledJobData } from './TaskQueue.js';
import { getPitchSequenceService } from '../../domain/services/PitchSequenceService.js';
import { outreachTrackerRepo } from '../../domain/repositories/OutreachTrackerRepository.js';

// Track if Redis is available
let redisAvailable = false;

// =============================================================================
// JOB TYPES
// =============================================================================

export const JOB_TYPES = {
  PROCESS_FOLLOW_UPS: 'process-follow-ups',
  SEND_DELAYED_PITCH: 'send-delayed-pitch',
  SEND_FOLLOW_UP: 'send-follow-up',
} as const;

// =============================================================================
// JOB DATA INTERFACES
// =============================================================================

export interface FollowUpProcessingJobData {
  type: 'scheduled';
  subtype: 'process-follow-ups';
  tenantId: string;
  scheduledTaskId: string;
  originalJobType: string;
  originalJobData: Record<string, unknown>;
}

export interface DelayedPitchJobData {
  type: 'scheduled';
  subtype: 'send-delayed-pitch';
  tenantId: string;
  trackerId: string;
  scheduledTaskId: string;
  originalJobType: string;
  originalJobData: Record<string, unknown>;
}

// =============================================================================
// WORKER PROCESSORS
// =============================================================================

// Extended scheduled job data with subtype for routing
interface ExtendedScheduledJobData extends ScheduledJobData {
  subtype?: string;
  trackerId?: string;
}

/**
 * Process the scheduled queue jobs
 */
async function processScheduledJob(job: Job<JobData>): Promise<unknown> {
  const data = job.data;

  if (data.type !== 'scheduled') {
    console.warn(`[Workers] Unexpected job type in scheduled queue: ${data.type}`);
    return { skipped: true };
  }

  const extendedData = data as ExtendedScheduledJobData;
  const subtype = extendedData.subtype || extendedData.originalJobType;

  switch (subtype) {
    case 'process-follow-ups':
      return processFollowUpsJob(job);

    case 'send-delayed-pitch':
      return processDelayedPitchJob(extendedData);

    default:
      console.warn(`[Workers] Unknown scheduled job subtype: ${subtype}`);
      return { skipped: true };
  }
}

/**
 * Process all due follow-ups across all tenants
 */
async function processFollowUpsJob(job: Job<JobData>): Promise<{ processed: number; errors: number }> {
  console.log(`[Workers] Processing follow-ups job ${job.id}`);

  const pitchService = getPitchSequenceService();
  const result = await pitchService.processFollowUps();

  console.log(`[Workers] Follow-ups processed: ${result.processed}, errors: ${result.errors}`);

  return result;
}

/**
 * Send a delayed pitch message to a specific candidate
 */
async function processDelayedPitchJob(data: ExtendedScheduledJobData): Promise<{ success: boolean }> {
  const trackerId = data.trackerId || (data.originalJobData as { trackerId?: string })?.trackerId;

  if (!trackerId) {
    console.warn('[Workers] No trackerId in delayed pitch job data');
    return { success: false };
  }

  console.log(`[Workers] Processing delayed pitch for tracker ${trackerId}`);

  const tracker = await outreachTrackerRepo.getById(trackerId);
  if (!tracker) {
    console.warn(`[Workers] Tracker not found: ${trackerId}`);
    return { success: false };
  }

  // Check if already pitched (in case of duplicate job)
  if (tracker.pitchSentAt) {
    console.log(`[Workers] Pitch already sent for tracker ${trackerId}`);
    return { success: true };
  }

  const pitchService = getPitchSequenceService();
  const result = await pitchService.sendPitch(tracker);

  return { success: result.success };
}

// =============================================================================
// REPEATABLE JOBS SETUP
// =============================================================================

/**
 * Set up repeatable job for follow-up processing
 * Runs every 15 minutes to check for and process due follow-ups
 */
async function setupFollowUpScheduler(): Promise<void> {
  const queueManager = getQueueManager();
  const queue = queueManager.getQueue(QUEUE_NAMES.SCHEDULED);

  // Remove any existing repeatable jobs with this name
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'follow-up-processor') {
      await queue.removeRepeatableByKey(job.key);
    }
  }

  // Add repeatable job - runs every 15 minutes
  await queue.add(
    'follow-up-processor',
    {
      type: 'scheduled',
      subtype: 'process-follow-ups',
      tenantId: 'all', // Process all tenants
      scheduledTaskId: 'follow-up-processor',
      originalJobType: 'process-follow-ups',
      originalJobData: {},
    },
    {
      repeat: {
        pattern: '*/15 * * * *', // Every 15 minutes
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  );

  console.log('[Workers] Follow-up scheduler registered (every 15 minutes)');
}

// =============================================================================
// WORKER INITIALIZATION
// =============================================================================

let workersInitialized = false;

/**
 * Test Redis connection before attempting to create workers
 */
async function testRedisConnection(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  return new Promise((resolve) => {
    const testClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry
      connectTimeout: 3000,
      lazyConnect: true,
    });

    const timeout = setTimeout(() => {
      testClient.disconnect();
      resolve(false);
    }, 3000);

    testClient.connect()
      .then(() => {
        clearTimeout(timeout);
        testClient.disconnect();
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeout);
        testClient.disconnect();
        resolve(false);
      });
  });
}

/**
 * Initialize all queue workers.
 * Should be called once at application startup.
 *
 * NOTE: Gracefully handles Redis not being available - will warn and continue
 * without the background job scheduler. Follow-ups can still be triggered
 * manually via the API endpoint.
 */
export async function initializeWorkers(): Promise<void> {
  if (workersInitialized) {
    console.warn('[Workers] Workers already initialized');
    return;
  }

  console.log('[Workers] Initializing queue workers...');

  // First, test if Redis is actually available
  const redisConnected = await testRedisConnection();

  if (!redisConnected) {
    console.warn('[Workers] Redis is not available - skipping worker initialization');
    console.warn('[Workers] Background job scheduling disabled. Use API endpoints for manual processing.');
    console.warn('[Workers] To enable background jobs, start Redis: brew services start redis (or docker run -p 6379:6379 redis)');
    redisAvailable = false;
    return;
  }

  redisAvailable = true;
  console.log('[Workers] Redis connection verified');

  try {
    const queueManager = getQueueManager();

    // Get the queue
    const queue = queueManager.getQueue(QUEUE_NAMES.SCHEDULED);

    // Register scheduled queue worker
    queueManager.registerWorker(
      QUEUE_NAMES.SCHEDULED,
      processScheduledJob,
      2 // Concurrency of 2 for scheduled jobs
    );

    console.log('[Workers] Scheduled queue worker registered');

    // Set up repeatable jobs
    await setupFollowUpScheduler();

    workersInitialized = true;
    console.log('[Workers] All workers initialized');
  } catch (error) {
    console.warn('[Workers] Failed to initialize workers');
    console.warn('[Workers] Error:', error instanceof Error ? error.message : error);
    // Don't throw - let the app continue without workers
  }
}

/**
 * Schedule a delayed pitch for a specific tracker
 * Returns true if scheduled, false if Redis not available
 */
export async function scheduleDelayedPitch(
  trackerId: string,
  delayMinutes: number,
  tenantId: string
): Promise<boolean> {
  if (!redisAvailable) {
    console.warn(`[Workers] Cannot schedule delayed pitch - Redis not available. Tracker: ${trackerId}`);
    console.warn('[Workers] Pitch will need to be sent manually via API endpoint');
    return false;
  }

  try {
    const queueManager = getQueueManager();

    await queueManager.addJob(
      QUEUE_NAMES.SCHEDULED,
      {
        type: 'scheduled',
        subtype: 'send-delayed-pitch',
        tenantId,
        trackerId,
        scheduledTaskId: `delayed-pitch-${trackerId}`,
        originalJobType: 'send-delayed-pitch',
        originalJobData: { trackerId },
      } as DelayedPitchJobData,
      {
        delay: delayMinutes * 60 * 1000,
      }
    );

    console.log(`[Workers] Scheduled delayed pitch for tracker ${trackerId} in ${delayMinutes} minutes`);
    return true;
  } catch (error) {
    console.warn(`[Workers] Failed to schedule delayed pitch for ${trackerId}:`, error);
    return false;
  }
}

/**
 * Get stats for follow-up processing
 */
export async function getFollowUpSchedulerStats(): Promise<{
  isRunning: boolean;
  nextRun: Date | null;
  repeatableJobs: number;
  redisAvailable: boolean;
}> {
  // Quick return if we already know Redis isn't available
  if (!redisAvailable) {
    return {
      isRunning: false,
      nextRun: null,
      repeatableJobs: 0,
      redisAvailable: false,
    };
  }

  try {
    const queueManager = getQueueManager();
    const queue = queueManager.getQueue(QUEUE_NAMES.SCHEDULED);

    const repeatableJobs = await queue.getRepeatableJobs();
    const followUpJob = repeatableJobs.find((j) => j.name === 'follow-up-processor');

    return {
      isRunning: !!followUpJob,
      nextRun: followUpJob?.next ? new Date(followUpJob.next) : null,
      repeatableJobs: repeatableJobs.length,
      redisAvailable: true,
    };
  } catch {
    // Redis not available
    return {
      isRunning: false,
      nextRun: null,
      repeatableJobs: 0,
      redisAvailable: false,
    };
  }
}
