/**
 * Health Check Routes
 */

import { Router } from 'express';
import { checkDatabaseHealth } from '../../infrastructure/database/prisma.js';
import { getQueueManager } from '../../infrastructure/queue/TaskQueue.js';

const router = Router();

/**
 * Basic health check
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'riley-recruiter',
  });
});

/**
 * Detailed health check with dependencies
 */
router.get('/ready', async (_req, res) => {
  const checks: Record<string, { status: string; latencyMs?: number }> = {};

  // Check database
  const dbStart = Date.now();
  const dbHealthy = await checkDatabaseHealth();
  checks.database = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    latencyMs: Date.now() - dbStart,
  };

  // Check Redis/Queue (if configured)
  try {
    const queueManager = getQueueManager();
    const stats = await queueManager.getAllQueueStats();
    checks.queue = {
      status: 'healthy',
    };
  } catch {
    checks.queue = {
      status: 'unhealthy',
    };
  }

  const allHealthy = Object.values(checks).every((c) => c.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * Liveness probe (Kubernetes)
 */
router.get('/live', (_req, res) => {
  res.json({ status: 'live' });
});

export default router;
