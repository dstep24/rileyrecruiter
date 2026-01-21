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
import { getQueueManager, QUEUE_NAMES, JobData } from './TaskQueue.js';
import { getPitchSequenceService } from '../../domain/services/PitchSequenceService.js';
import { getConversationOrchestrator } from '../../domain/services/ConversationOrchestrator.js';
import { outreachTrackerRepo } from '../../domain/repositories/OutreachTrackerRepository.js';

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

export interface FollowUpProcessingJobData extends JobData {
  type: 'scheduled';
  subtype: 'process-follow-ups';
  tenantId: string;
}

export interface DelayedPitchJobData extends JobData {
  type: 'scheduled';
  subtype: 'send-delayed-pitch';
  tenantId: string;
  trackerId: string;
}

// =============================================================================
// WORKER PROCESSORS
// =============================================================================

/**
 * Process the scheduled queue jobs
 */
async function processScheduledJob(job: Job<JobData>): Promise<unknown> {
  const data = job.data;

  if (data.type !== 'scheduled') {
    console.warn(`[Workers] Unexpected job type in scheduled queue: ${data.type}`);
    return { skipped: true };
  }

  const subtype = (data as FollowUpProcessingJobData | DelayedPitchJobData).subtype;

  switch (subtype) {
    case 'process-follow-ups':
      return processFollowUpsJob(job);

    case 'send-delayed-pitch':
      return processDelayedPitchJob(job as Job<DelayedPitchJobData>);

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
async function processDelayedPitchJob(job: Job<DelayedPitchJobData>): Promise<{ success: boolean }> {
  console.log(`[Workers] Processing delayed pitch for tracker ${job.data.trackerId}`);

  const tracker = await outreachTrackerRepo.getById(job.data.trackerId);
  if (!tracker) {
    console.warn(`[Workers] Tracker not found: ${job.data.trackerId}`);
    return { success: false };
  }

  // Check if already pitched (in case of duplicate job)
  if (tracker.pitchSentAt) {
    console.log(`[Workers] Pitch already sent for tracker ${job.data.trackerId}`);
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
 * Initialize all queue workers.
 * Should be called once at application startup.
 */
export async function initializeWorkers(): Promise<void> {
  if (workersInitialized) {
    console.warn('[Workers] Workers already initialized');
    return;
  }

  console.log('[Workers] Initializing queue workers...');

  const queueManager = getQueueManager();

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
}

/**
 * Schedule a delayed pitch for a specific tracker
 */
export async function scheduleDelayedPitch(
  trackerId: string,
  delayMinutes: number,
  tenantId: string
): Promise<void> {
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
}

/**
 * Get stats for follow-up processing
 */
export async function getFollowUpSchedulerStats(): Promise<{
  isRunning: boolean;
  nextRun: Date | null;
  repeatableJobs: number;
}> {
  const queueManager = getQueueManager();
  const queue = queueManager.getQueue(QUEUE_NAMES.SCHEDULED);

  const repeatableJobs = await queue.getRepeatableJobs();
  const followUpJob = repeatableJobs.find((j) => j.name === 'follow-up-processor');

  return {
    isRunning: !!followUpJob,
    nextRun: followUpJob?.next ? new Date(followUpJob.next) : null,
    repeatableJobs: repeatableJobs.length,
  };
}
