/**
 * Actions API Routes - Riley Trigger System
 *
 * Endpoints to trigger Riley's autonomous actions:
 * - Sourcing candidates
 * - Sending outreach
 * - Running inner loop
 * - Scheduling interviews
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getTenantIdFromRequest } from '../middleware/tenantMiddleware.js';
import { getInnerLoopEngine } from '../../core/inner-loop/InnerLoopEngine.js';
import { getTaskRepository } from '../../domain/repositories/TaskRepository.js';
import { getQueueManager } from '../../infrastructure/queue/TaskQueue.js';

const router = Router();

// =============================================================================
// SCHEMAS
// =============================================================================

const sourcingSchema = z.object({
  requisitionId: z.string().min(1),
  maxCandidates: z.number().int().positive().max(100).default(20),
});

const outreachSchema = z.object({
  candidateIds: z.array(z.string()).min(1).max(50),
  channel: z.enum(['email', 'linkedin']).default('email'),
});

const innerLoopSchema = z.object({
  taskType: z.string().min(1),
  context: z.record(z.unknown()),
});

const screeningSchema = z.object({
  candidateId: z.string().min(1),
  requisitionId: z.string().min(1),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /actions/source - Trigger candidate sourcing
 */
router.post('/source', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { requisitionId, maxCandidates } = sourcingSchema.parse(req.body);

    const runId = uuid();
    const queueManager = getQueueManager();

    // Queue the sourcing job
    await queueManager.addTask({
      id: runId,
      tenantId,
      type: 'SEARCH_CANDIDATES',
      payload: {
        requisitionId,
        maxCandidates,
      },
      priority: 'MEDIUM',
    });

    res.json({
      runId,
      status: 'queued',
      message: `Sourcing job queued for requisition ${requisitionId}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /actions/outreach - Trigger outreach to candidates
 */
router.post('/outreach', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { candidateIds, channel } = outreachSchema.parse(req.body);

    const taskRepo = getTaskRepository();
    const tasks = [];

    // Create a task for each candidate
    for (const candidateId of candidateIds) {
      const task = await taskRepo.create({
        tenantId,
        type: channel === 'email' ? 'SEND_EMAIL' : 'SEND_LINKEDIN_MESSAGE',
        payload: {
          candidateId,
          channel,
          requiresInnerLoop: true,
        },
        status: 'DRAFT',
        priority: 'MEDIUM',
        effectful: true,
      });
      tasks.push(task);
    }

    // Queue inner loop runs for each task
    const queueManager = getQueueManager();
    for (const task of tasks) {
      await queueManager.addInnerLoopRun({
        taskId: task.id,
        tenantId,
        taskType: task.type,
        context: task.payload as Record<string, unknown>,
      });
    }

    res.json({
      count: tasks.length,
      status: 'queued',
      message: `${tasks.length} outreach tasks created and queued for inner loop`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /actions/inner-loop - Manually trigger inner loop run
 */
router.post('/inner-loop', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { taskType, context } = innerLoopSchema.parse(req.body);

    const engine = getInnerLoopEngine();
    const runId = uuid();

    // Run inner loop (async - don't await)
    engine
      .run({
        taskType,
        context: {
          ...context,
          tenantId,
        },
      })
      .then((result) => {
        console.log(`[Actions] Inner loop ${runId} completed:`, result.status);
      })
      .catch((error) => {
        console.error(`[Actions] Inner loop ${runId} failed:`, error);
      });

    res.json({
      runId,
      status: 'started',
      message: `Inner loop started for ${taskType}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /actions/screen - Trigger candidate screening
 */
router.post('/screen', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { candidateId, requisitionId } = screeningSchema.parse(req.body);

    const taskRepo = getTaskRepository();

    // Create screening task
    const task = await taskRepo.create({
      tenantId,
      requisitionId,
      type: 'SCREEN_RESUME',
      payload: {
        candidateId,
        requisitionId,
      },
      status: 'DRAFT',
      priority: 'MEDIUM',
      effectful: false,
    });

    // Queue inner loop run
    const queueManager = getQueueManager();
    await queueManager.addInnerLoopRun({
      taskId: task.id,
      tenantId,
      taskType: 'SCREEN_RESUME',
      context: {
        candidateId,
        requisitionId,
      },
    });

    res.json({
      taskId: task.id,
      status: 'queued',
      message: `Screening task created for candidate ${candidateId}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /actions/follow-up - Trigger follow-up sequence
 */
router.post('/follow-up', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const taskRepo = getTaskRepository();

    // Find candidates needing follow-up (mock for now)
    // In production, query candidates with no response after X days

    const followUpCount = 0; // Would be actual count

    res.json({
      count: followUpCount,
      status: 'processed',
      message: `${followUpCount} follow-up tasks created`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /actions/status/:runId - Check status of an action
 */
router.get('/status/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;

    // In production, look up the job status from Redis/DB
    res.json({
      runId,
      status: 'completed', // Mock
      progress: 100,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
