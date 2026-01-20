/**
 * Tasks API Routes
 *
 * Endpoints for managing tasks in the Two-Loop System.
 * Tasks represent operations that Riley generates.
 */

import { Router } from 'express';
import { z } from 'zod';
import { getTaskRepository } from '../../domain/repositories/TaskRepository.js';
import { getTenantIdFromRequest } from '../middleware/tenantMiddleware.js';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler.js';

const router = Router();
const taskRepo = getTaskRepository();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const approveSchema = z.object({
  approvedBy: z.string().min(1),
});

const rejectSchema = z.object({
  rejectedBy: z.string().min(1),
  reason: z.string().optional(),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /tasks - List tasks
 */
router.get('/', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { page, pageSize } = paginationSchema.parse(req.query);
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (type) where.type = type;

    const result = await taskRepo.findManyPaginated(where, {
      pagination: { page, pageSize },
      sort: { field: 'createdAt', direction: 'desc' },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/pending - Get pending approval tasks
 */
router.get('/pending', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const tasks = await taskRepo.getPendingApproval(tenantId);

    res.json({
      data: tasks,
      count: tasks.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/statistics - Get task statistics
 */
router.get('/statistics', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const statistics = await taskRepo.getStatistics(tenantId);

    res.json(statistics);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id - Get a task by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const task = await taskRepo.findById(req.params.id);

    if (!task) {
      throw new NotFoundError('Task', req.params.id);
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/approve - Approve a task
 */
router.post('/:id/approve', async (req, res, next) => {
  try {
    const { approvedBy } = approveSchema.parse(req.body);
    const task = await taskRepo.approve(req.params.id, approvedBy);

    res.json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/reject - Reject a task
 */
router.post('/:id/reject', async (req, res, next) => {
  try {
    const { rejectedBy, reason } = rejectSchema.parse(req.body);
    const task = await taskRepo.reject(req.params.id, rejectedBy, reason);

    res.json(task);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/batch/approve - Batch approve tasks
 */
router.post('/batch/approve', async (req, res, next) => {
  try {
    const schema = z.object({
      taskIds: z.array(z.string()).min(1).max(50),
      approvedBy: z.string().min(1),
    });

    const { taskIds, approvedBy } = schema.parse(req.body);

    const results = await Promise.allSettled(
      taskIds.map((id) => taskRepo.approve(id, approvedBy))
    );

    const approved = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    res.json({
      approved,
      failed,
      total: taskIds.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/batch/reject - Batch reject tasks
 */
router.post('/batch/reject', async (req, res, next) => {
  try {
    const schema = z.object({
      taskIds: z.array(z.string()).min(1).max(50),
      rejectedBy: z.string().min(1),
      reason: z.string().optional(),
    });

    const { taskIds, rejectedBy, reason } = schema.parse(req.body);

    const results = await Promise.allSettled(
      taskIds.map((id) => taskRepo.reject(id, rejectedBy, reason))
    );

    const rejected = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    res.json({
      rejected,
      failed,
      total: taskIds.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
