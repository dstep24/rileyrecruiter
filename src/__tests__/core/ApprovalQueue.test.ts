/**
 * Approval Queue Tests
 *
 * Tests the task approval workflow.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ApprovalQueue, ApprovalQueueConfig } from '../../core/outer-loop/ApprovalQueue.js';

// Mock dependencies
jest.mock('../../generated/prisma/index.js', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

describe('ApprovalQueue', () => {
  let queue: ApprovalQueue;
  const config: ApprovalQueueConfig = {
    tenantId: 'test-tenant',
    expirationHours: 24,
    priorityWeights: {
      urgency: 0.4,
      age: 0.3,
      type: 0.3,
    },
    notifyOnNewTask: true,
  };

  beforeEach(() => {
    queue = new ApprovalQueue(config);
  });

  describe('queue operations', () => {
    it('should initialize with config', () => {
      expect(queue).toBeDefined();
    });

    it('should get pending tasks', async () => {
      const tasks = await queue.getPending();
      expect(Array.isArray(tasks)).toBe(true);
    });

    it('should get pending tasks with filters', async () => {
      const tasks = await queue.getPending({
        status: 'PENDING_APPROVAL',
        priority: 'HIGH',
      });
      expect(Array.isArray(tasks)).toBe(true);
    });
  });

  describe('approval workflow', () => {
    it('should approve a task', async () => {
      const result = await queue.approve('task-id', 'teleoperator-id');
      expect(result).toBeDefined();
    });

    it('should reject a task with reason', async () => {
      const result = await queue.reject('task-id', 'teleoperator-id', 'Not appropriate');
      expect(result).toBeDefined();
    });

    it('should handle batch approve', async () => {
      const results = await queue.batchApprove(['task-1', 'task-2'], 'teleoperator-id');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle batch reject', async () => {
      const results = await queue.batchReject(['task-1', 'task-2'], 'teleoperator-id', 'Batch rejection');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('task modification', () => {
    it('should edit and approve a task', async () => {
      const result = await queue.editAndApprove(
        'task-id',
        'teleoperator-id',
        { content: 'Modified content' }
      );
      expect(result).toBeDefined();
    });
  });

  describe('queue statistics', () => {
    it('should get queue stats', async () => {
      const stats = await queue.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalPending).toBeGreaterThanOrEqual(0);
    });

    it('should get priority breakdown', async () => {
      const stats = await queue.getStats();
      expect(stats.byPriority).toBeDefined();
    });
  });

  describe('expiration handling', () => {
    it('should mark expired tasks', async () => {
      const expired = await queue.markExpired();
      expect(typeof expired).toBe('number');
      expect(expired).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Approval Queue Priority', () => {
  let queue: ApprovalQueue;

  beforeEach(() => {
    queue = new ApprovalQueue({
      tenantId: 'test-tenant',
      expirationHours: 24,
      priorityWeights: {
        urgency: 0.5,
        age: 0.3,
        type: 0.2,
      },
      notifyOnNewTask: false,
    });
  });

  it('should sort by priority', async () => {
    const tasks = await queue.getPending({ sortBy: 'priority' });
    expect(Array.isArray(tasks)).toBe(true);
  });

  it('should sort by createdAt', async () => {
    const tasks = await queue.getPending({ sortBy: 'createdAt' });
    expect(Array.isArray(tasks)).toBe(true);
  });
});
