/**
 * Claude Client - LLM Integration for Riley
 *
 * Dedicated Claude integration (no abstraction layer).
 * Handles all AI operations for the inner loop:
 * - Generating outputs (messages, assessments, etc.)
 * - Evaluating outputs against criteria
 * - Extracting learnings from failures
 * - Regenerating guidelines
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ClaudeClientConfig {
  apiKey: string;
  defaultModel: ClaudeModel;
  maxRetries: number;
  timeoutMs: number;
}

export type ClaudeModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022';

const DEFAULT_CONFIG: Partial<ClaudeClientConfig> = {
  defaultModel: 'claude-sonnet-4-20250514',
  maxRetries: 3,
  timeoutMs: 120000,
};

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export interface ClaudeRequest {
  prompt: string;
  systemPrompt?: string;
  model?: ClaudeModel;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  metadata?: RequestMetadata;
}

export interface RequestMetadata {
  tenantId: string;
  taskType?: string;
  runId?: string;
}

export interface ClaudeResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  stopReason: string | null;
  latencyMs: number;
}

// =============================================================================
// SPECIALIZED REQUEST TYPES
// =============================================================================

export interface GenerateRequest {
  taskType: string;
  context: Record<string, unknown>;
  guidelines: GuidelinesContext;
  constraints?: GenerationConstraint[];
}

export interface GuidelinesContext {
  relevantWorkflows: unknown[];
  relevantTemplates: unknown[];
  brandVoice: unknown;
  constraints: unknown[];
}

export interface GenerationConstraint {
  type: string;
  description: string;
  config: Record<string, unknown>;
}

export interface EvaluateRequest {
  output: unknown;
  criteria: CriteriaContext;
  dimensions: string[];
}

export interface CriteriaContext {
  qualityStandards: unknown[];
  evaluationRubrics: unknown[];
  failurePatterns: unknown[];
}

export interface ExtractLearningsRequest {
  failedOutput: unknown;
  evaluation: unknown;
  context: Record<string, unknown>;
}

export interface RegenerateGuidelinesRequest {
  currentGuidelines: unknown;
  learnings: unknown[];
  context: Record<string, unknown>;
}

// =============================================================================
// CLAUDE CLIENT
// =============================================================================

export class ClaudeClient {
  private client: Anthropic;
  private config: ClaudeClientConfig;

  constructor(config: Partial<ClaudeClientConfig>) {
    this.config = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
      defaultModel: config.defaultModel || DEFAULT_CONFIG.defaultModel!,
      maxRetries: config.maxRetries || DEFAULT_CONFIG.maxRetries!,
      timeoutMs: config.timeoutMs || DEFAULT_CONFIG.timeoutMs!,
    };

    if (!this.config.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeoutMs,
    });
  }

  // ===========================================================================
  // CORE API
  // ===========================================================================

  async chat(request: ClaudeRequest): Promise<ClaudeResponse> {
    const startTime = Date.now();

    const messages: MessageParam[] = [
      {
        role: 'user',
        content: request.prompt,
      },
    ];

    const response: Message = await this.client.messages.create({
      model: request.model || this.config.defaultModel,
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages,
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
    });

    const textContent = response.content
      .filter((block): block is ContentBlock & { type: 'text' } => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      stopReason: response.stop_reason,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Complete a prompt - alias for chat with simplified interface
   */
  async complete(options: {
    prompt: string;
    system?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<ClaudeResponse> {
    return this.chat({
      prompt: options.prompt,
      systemPrompt: options.system,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  // ===========================================================================
  // INNER LOOP OPERATIONS
  // ===========================================================================

  /**
   * Generate output using Guidelines (G)
   * This is the "forward pass" in the ML analogy
   */
  async generate(request: GenerateRequest): Promise<ClaudeResponse> {
    const systemPrompt = this.buildGenerationSystemPrompt(request);
    const userPrompt = this.buildGenerationUserPrompt(request);

    return this.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 4096,
    });
  }

  /**
   * Evaluate output against Criteria (C)
   * This is the "loss function" in the ML analogy
   */
  async evaluate(request: EvaluateRequest): Promise<ClaudeResponse> {
    const systemPrompt = this.buildEvaluationSystemPrompt(request);
    const userPrompt = this.buildEvaluationUserPrompt(request);

    return this.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.2, // Lower temperature for consistent evaluation
      maxTokens: 2048,
    });
  }

  /**
   * Extract learnings from failed output
   * This is part of "backpropagation" in the ML analogy
   */
  async extractLearnings(request: ExtractLearningsRequest): Promise<ClaudeResponse> {
    const systemPrompt = `You are an AI learning analyst. Your job is to analyze failed outputs and extract actionable learnings that can improve the generative guidelines.

Focus on:
1. What specific aspects of the output failed to meet criteria
2. What patterns or gaps in the current guidelines led to this failure
3. Concrete, actionable improvements to the guidelines

Output your analysis as JSON with this structure:
{
  "insights": [
    {
      "type": "pattern|gap|conflict|improvement",
      "description": "...",
      "confidence": 0.0-1.0,
      "affectedGuidelines": ["..."]
    }
  ],
  "proposedUpdates": [
    {
      "targetPath": "workflows[0].stages[1]...",
      "operation": "add|modify|remove",
      "newValue": {...},
      "reason": "..."
    }
  ],
  "reasoning": "Overall explanation of learnings"
}`;

    const userPrompt = `Analyze this failed output and extract learnings:

## Failed Output
${JSON.stringify(request.failedOutput, null, 2)}

## Evaluation Results
${JSON.stringify(request.evaluation, null, 2)}

## Context
${JSON.stringify(request.context, null, 2)}

Extract actionable learnings that can improve the guidelines.`;

    return this.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.3,
      maxTokens: 2048,
    });
  }

  /**
   * Regenerate guidelines based on learnings
   * This is the "weight update" in the ML analogy
   *
   * Key: Learn-Regenerate, NOT Edit-Revise
   * We generate NEW guidelines incorporating learnings,
   * rather than patching the existing ones.
   */
  async regenerateGuidelines(request: RegenerateGuidelinesRequest): Promise<ClaudeResponse> {
    const systemPrompt = `You are an AI guidelines architect. Your job is to regenerate improved guidelines based on learnings from failed outputs.

CRITICAL: You must REGENERATE guidelines, not just edit them.
- Understand WHY the current guidelines led to failure
- Design NEW guidelines that address the root cause
- Preserve what works while fixing what doesn't
- Maintain consistency and coherence across the full guidelines

Output the updated guidelines section as JSON.`;

    const userPrompt = `Regenerate improved guidelines based on these learnings:

## Current Guidelines
${JSON.stringify(request.currentGuidelines, null, 2)}

## Learnings from Failures
${JSON.stringify(request.learnings, null, 2)}

## Context
${JSON.stringify(request.context, null, 2)}

Generate improved guidelines that address these learnings.`;

    return this.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
      maxTokens: 4096,
    });
  }

  // ===========================================================================
  // PROMPT BUILDERS
  // ===========================================================================

  private buildGenerationSystemPrompt(request: GenerateRequest): string {
    return `You are Riley, an AI recruiting assistant. Your job is to generate high-quality recruiting outputs.

## Your Guidelines
Follow these guidelines strictly:

### Workflows
${JSON.stringify(request.guidelines.relevantWorkflows, null, 2)}

### Templates
${JSON.stringify(request.guidelines.relevantTemplates, null, 2)}

### Brand Voice
${JSON.stringify(request.guidelines.brandVoice, null, 2)}

### Constraints
${JSON.stringify(request.guidelines.constraints, null, 2)}

${request.constraints ? `### Additional Constraints\n${JSON.stringify(request.constraints, null, 2)}` : ''}

Generate output that follows these guidelines precisely.`;
  }

  private buildGenerationUserPrompt(request: GenerateRequest): string {
    return `Generate a ${request.taskType} with the following context:

${JSON.stringify(request.context, null, 2)}

Output should be JSON with the appropriate structure for this task type.`;
  }

  private buildEvaluationSystemPrompt(request: EvaluateRequest): string {
    return `You are an AI quality evaluator. Your job is to evaluate recruiting outputs against quality criteria.

## Evaluation Criteria
${JSON.stringify(request.criteria, null, 2)}

## Dimensions to Evaluate
${request.dimensions.join(', ')}

Evaluate strictly and objectively. Output your evaluation as JSON:
{
  "overallScore": 0.0-1.0,
  "dimensionScores": [
    {
      "dimension": "...",
      "score": 0.0-1.0,
      "weight": 0.0-1.0,
      "criteria": ["criteria that were checked"],
      "evidence": ["evidence from the output"],
      "reasoning": "why this score"
    }
  ],
  "passedThreshold": true/false,
  "failures": [
    {
      "dimension": "...",
      "expectedScore": 0.0-1.0,
      "actualScore": 0.0-1.0,
      "reason": "...",
      "suggestion": "..."
    }
  ],
  "reasoning": "overall explanation"
}`;
  }

  private buildEvaluationUserPrompt(request: EvaluateRequest): string {
    return `Evaluate this output:

${JSON.stringify(request.output, null, 2)}

Provide a detailed evaluation against the criteria.`;
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Parse JSON from Claude's response, handling common issues
   */
  parseJsonResponse<T>(response: ClaudeResponse): T {
    let content = response.content.trim();

    // Handle markdown code blocks
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }

    return JSON.parse(content.trim()) as T;
  }

  /**
   * Get token usage statistics
   */
  getUsageStats(responses: ClaudeResponse[]): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
  } {
    const totalInputTokens = responses.reduce((sum, r) => sum + r.usage.inputTokens, 0);
    const totalOutputTokens = responses.reduce((sum, r) => sum + r.usage.outputTokens, 0);
    const avgLatencyMs = responses.reduce((sum, r) => sum + r.latencyMs, 0) / responses.length;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      avgLatencyMs,
    };
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let clientInstance: ClaudeClient | null = null;

export function getClaudeClient(config?: Partial<ClaudeClientConfig>): ClaudeClient {
  if (!clientInstance) {
    clientInstance = new ClaudeClient(config || {});
  }
  return clientInstance;
}

export function resetClaudeClient(): void {
  clientInstance = null;
}
