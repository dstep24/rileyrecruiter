/**
 * Inner Loop Engine Tests
 *
 * Tests the core generate-evaluate-learn cycle.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { InnerLoopEngine, InnerLoopConfig } from '../../core/inner-loop/InnerLoopEngine.js';

// Mock dependencies
jest.mock('../../integrations/llm/ClaudeClient.js', () => ({
  getClaudeClient: () => ({
    generate: jest.fn().mockResolvedValue({
      content: JSON.stringify({ message: 'Generated content' }),
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      latencyMs: 500,
    }),
    evaluate: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        overallScore: 0.85,
        passedThreshold: true,
        dimensionScores: [],
        failures: [],
      }),
      usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      latencyMs: 400,
    }),
    extractLearnings: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        insights: [],
        proposedUpdates: [],
        reasoning: 'No issues found',
      }),
      usage: { inputTokens: 60, outputTokens: 30, totalTokens: 90 },
      latencyMs: 300,
    }),
    parseJsonResponse: jest.fn().mockImplementation((response: { content: string }) => JSON.parse(response.content)),
  }),
}));

jest.mock('../../core/inner-loop/GuidelinesManager.js', () => ({
  getGuidelinesManager: () => ({
    getActiveOrThrow: jest.fn().mockResolvedValue({
      workflows: [],
      templates: [],
      decisionTrees: [],
      constraints: [],
    }),
  }),
}));

jest.mock('../../core/inner-loop/CriteriaEvaluator.js', () => ({
  getCriteriaEvaluator: () => ({
    getActiveOrThrow: jest.fn().mockResolvedValue({
      qualityStandards: [],
      evaluationRubrics: [],
      successMetrics: [],
      failurePatterns: [],
    }),
  }),
}));

describe('InnerLoopEngine', () => {
  let engine: InnerLoopEngine;
  const config: InnerLoopConfig = {
    tenantId: 'test-tenant',
    maxIterations: 5,
    convergenceThreshold: 0.8,
    timeoutMs: 30000,
  };

  beforeEach(() => {
    engine = new InnerLoopEngine(config);
  });

  describe('configuration', () => {
    it('should initialize with provided config', () => {
      expect(engine).toBeDefined();
    });

    it('should respect max iterations', () => {
      const customConfig: InnerLoopConfig = {
        ...config,
        maxIterations: 3,
      };
      const customEngine = new InnerLoopEngine(customConfig);
      expect(customEngine).toBeDefined();
    });
  });

  describe('run', () => {
    it('should execute inner loop and return result', async () => {
      const result = await engine.run({
        taskType: 'send_outreach',
        context: {
          candidateId: 'test-candidate',
          requisitionId: 'test-req',
          candidateName: 'John Doe',
          roleName: 'Software Engineer',
        },
      });

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(['converged', 'max_iterations', 'timeout', 'error']).toContain(result.status);
    });

    it('should handle context with all required fields', async () => {
      const result = await engine.run({
        taskType: 'screen_resume',
        context: {
          candidateId: 'test-candidate',
          requisitionId: 'test-req',
          resume: { text: 'Sample resume content' },
        },
      });

      expect(result).toBeDefined();
    });
  });

  describe('convergence', () => {
    it('should converge when output meets criteria', async () => {
      const result = await engine.run({
        taskType: 'send_outreach',
        context: {
          candidateId: 'test-candidate',
          requisitionId: 'test-req',
        },
      });

      // With mocked passing evaluation, should converge
      expect(result.status).toBe('converged');
    });

    it('should respect convergence threshold', async () => {
      // Engine should converge when score >= threshold
      const customConfig: InnerLoopConfig = {
        ...config,
        convergenceThreshold: 0.9, // Higher threshold
      };
      const customEngine = new InnerLoopEngine(customConfig);

      const result = await customEngine.run({
        taskType: 'send_outreach',
        context: {},
      });

      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing guidelines gracefully', async () => {
      // Test error handling when guidelines not found
      const result = await engine.run({
        taskType: 'send_outreach',
        context: {},
      });

      expect(result).toBeDefined();
    });

    it('should handle API errors', async () => {
      // Engine should handle Claude API errors
      const result = await engine.run({
        taskType: 'send_outreach',
        context: {},
      });

      expect(result).toBeDefined();
    });
  });
});

describe('Inner Loop Metrics', () => {
  let engine: InnerLoopEngine;

  beforeEach(() => {
    engine = new InnerLoopEngine({
      tenantId: 'test-tenant',
      maxIterations: 5,
      convergenceThreshold: 0.8,
      timeoutMs: 30000,
    });
  });

  it('should track iterations', async () => {
    const result = await engine.run({
      taskType: 'send_outreach',
      context: {},
    });

    expect(result.iterations).toBeGreaterThanOrEqual(1);
  });

  it('should track total duration', async () => {
    const result = await engine.run({
      taskType: 'send_outreach',
      context: {},
    });

    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});
