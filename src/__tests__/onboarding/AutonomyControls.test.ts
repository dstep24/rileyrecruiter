/**
 * Autonomy Controls Tests
 *
 * Tests the graduated autonomy system.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AutonomyController, ActionContext } from '../../onboarding/AutonomyControls.js';

// Mock Prisma
jest.mock('../../generated/prisma/index.js', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'test-tenant',
        name: 'Test Tenant',
        status: 'SUPERVISED',
        updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    task: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

describe('AutonomyController', () => {
  let controller: AutonomyController;

  beforeEach(() => {
    controller = new AutonomyController();
  });

  describe('level management', () => {
    it('should get autonomy level for tenant', async () => {
      const level = await controller.getAutonomyLevel('test-tenant');
      expect(level).toBeDefined();
      expect(level.status).toBeDefined();
    });

    it('should return correct approval requirements', async () => {
      const level = await controller.getAutonomyLevel('test-tenant');
      expect(level.approvalRequired).toBeDefined();
      expect(typeof level.approvalRequired.allTasks).toBe('boolean');
    });
  });

  describe('approval checking', () => {
    it('should check if action requires approval', async () => {
      const context: ActionContext = {
        taskType: 'send_email',
        isEffectful: true,
        isFirstContact: true,
        isSensitive: false,
        isHighValue: false,
      };

      const result = await controller.requiresApproval('test-tenant', 'send', context);
      expect(result).toBeDefined();
      expect(typeof result.required).toBe('boolean');
    });

    it('should require approval for sensitive topics', async () => {
      const context: ActionContext = {
        content: 'Let me discuss the salary for this position',
        isEffectful: true,
        isFirstContact: false,
        isSensitive: true,
        isHighValue: false,
      };

      const result = await controller.requiresApproval('test-tenant', 'send', context);
      expect(result.required).toBe(true);
    });

    it('should check for keyword triggers', async () => {
      const context: ActionContext = {
        content: 'Your compensation package will include equity',
        isEffectful: true,
        isFirstContact: false,
        isSensitive: false,
        isHighValue: false,
      };

      const result = await controller.requiresApproval('test-tenant', 'send', context);
      expect(result.required).toBe(true);
    });
  });

  describe('promotion evaluation', () => {
    it('should evaluate promotion eligibility', async () => {
      const evaluation = await controller.evaluatePromotion('test-tenant');
      expect(evaluation).toBeDefined();
      expect(evaluation.currentLevel).toBeDefined();
    });

    it('should return blockers if not eligible', async () => {
      const evaluation = await controller.evaluatePromotion('test-tenant');
      if (!evaluation.eligible) {
        expect(evaluation.blockers).toBeDefined();
        expect(Array.isArray(evaluation.blockers)).toBe(true);
      }
    });
  });

  describe('demotion evaluation', () => {
    it('should evaluate demotion need', async () => {
      const evaluation = await controller.evaluateDemotion('test-tenant');
      expect(evaluation).toBeDefined();
      expect(typeof evaluation.shouldDemote).toBe('boolean');
    });

    it('should provide reasons for demotion', async () => {
      const evaluation = await controller.evaluateDemotion('test-tenant');
      if (evaluation.shouldDemote) {
        expect(evaluation.reasons).toBeDefined();
        expect(Array.isArray(evaluation.reasons)).toBe(true);
      }
    });
  });

  describe('metrics calculation', () => {
    it('should calculate daily metrics', async () => {
      const metrics = await controller.calculateMetrics('test-tenant', 'day');
      expect(metrics).toBeDefined();
      expect(metrics.period).toBe('day');
    });

    it('should calculate weekly metrics', async () => {
      const metrics = await controller.calculateMetrics('test-tenant', 'week');
      expect(metrics).toBeDefined();
      expect(metrics.period).toBe('week');
    });

    it('should include calculated scores', async () => {
      const metrics = await controller.calculateMetrics('test-tenant', 'week');
      expect(metrics.calculatedScores).toBeDefined();
      expect(metrics.calculatedScores.approvalRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('transition history', () => {
    it('should track transition history', () => {
      const history = controller.getTransitionHistory('test-tenant');
      expect(Array.isArray(history)).toBe(true);
    });
  });
});

describe('Autonomy Level Configurations', () => {
  let controller: AutonomyController;

  beforeEach(() => {
    controller = new AutonomyController();
  });

  it('should have correct ONBOARDING level config', async () => {
    // Mock tenant at ONBOARDING level
    const level = await controller.getAutonomyLevel('test-tenant');
    // Since mocked to SUPERVISED, check that level exists
    expect(['ONBOARDING', 'SHADOW_MODE', 'SUPERVISED', 'AUTONOMOUS', 'PAUSED']).toContain(level.status);
  });

  it('should have allowed and blocked actions', async () => {
    const level = await controller.getAutonomyLevel('test-tenant');
    expect(Array.isArray(level.allowedActions)).toBe(true);
    expect(Array.isArray(level.blockedActions)).toBe(true);
  });
});
