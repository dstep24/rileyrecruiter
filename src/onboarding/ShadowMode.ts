/**
 * Shadow Mode Runner
 *
 * Observes human recruiter interactions and generates "what Riley would have done"
 * comparisons. This allows Riley to learn from human decisions before going live.
 *
 * Key features:
 * - Capture human interactions (messages, decisions)
 * - Generate Riley's alternative output
 * - Compare and score differences
 * - Refine G/C based on learnings
 *
 * Shadow mode is READ-ONLY - Riley never takes action, only observes and learns.
 */

import { v4 as uuid } from 'uuid';
import { PrismaClient } from '../generated/prisma/index.js';
import { getClaudeClient, ClaudeClient } from '../integrations/llm/ClaudeClient.js';
import { InnerLoopEngine, getInnerLoopEngine } from '../core/inner-loop/InnerLoopEngine.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ShadowModeConfig {
  tenantId: string;
  enabled: boolean;
  captureTypes: CaptureType[];
  comparisonThreshold: number; // Min similarity for "match"
  learningBatchSize: number; // Interactions before G/C refinement
}

export type CaptureType =
  | 'outreach_message'
  | 'follow_up_message'
  | 'screening_decision'
  | 'scheduling_action'
  | 'candidate_response_handling';

export interface ShadowSession {
  id: string;
  tenantId: string;
  startedAt: Date;
  endedAt?: Date;
  status: 'active' | 'paused' | 'completed';
  stats: ShadowStats;
}

export interface ShadowStats {
  totalInteractions: number;
  messagesCapured: number;
  decisionsCapured: number;
  comparisonsGenerated: number;
  matchRate: number; // % Riley matched human
  learningCycles: number;
}

export interface CapturedInteraction {
  id: string;
  sessionId: string;
  tenantId: string;
  type: CaptureType;
  timestamp: Date;
  context: InteractionContext;
  humanAction: HumanAction;
  rileyAlternative?: RileyAlternative;
  comparison?: ComparisonResult;
}

export interface InteractionContext {
  candidateId?: string;
  requisitionId?: string;
  conversationId?: string;
  previousMessages?: string[];
  candidateProfile?: Record<string, unknown>;
  roleRequirements?: Record<string, unknown>;
}

export interface HumanAction {
  actionType: string;
  content: string;
  metadata?: Record<string, unknown>;
  performedBy: string;
  performedAt: Date;
}

export interface RileyAlternative {
  actionType: string;
  content: string;
  confidence: number;
  reasoning: string;
  generatedAt: Date;
}

export interface ComparisonResult {
  similarity: number; // 0.0-1.0
  isMatch: boolean;
  dimensions: DimensionComparison[];
  learnings: string[];
  recommendedUpdates?: GuidelineUpdate[];
}

export interface DimensionComparison {
  dimension: string;
  humanScore: number;
  rileyScore: number;
  difference: number;
  notes?: string;
}

export interface GuidelineUpdate {
  type: 'workflow' | 'template' | 'constraint';
  path: string;
  reason: string;
  suggestedChange: unknown;
}

// Shadow mode learning
export interface ShadowLearning {
  id: string;
  sessionId: string;
  interactionIds: string[];
  patterns: LearnedPattern[];
  guidelineUpdates: GuidelineUpdate[];
  criteriaUpdates: CriteriaUpdate[];
  appliedAt?: Date;
}

export interface LearnedPattern {
  type: string;
  description: string;
  frequency: number;
  examples: string[];
  confidence: number;
}

export interface CriteriaUpdate {
  type: 'rubric' | 'standard' | 'threshold';
  path: string;
  reason: string;
  suggestedChange: unknown;
}

// =============================================================================
// SHADOW MODE RUNNER
// =============================================================================

export class ShadowModeRunner {
  private config: ShadowModeConfig;
  private prisma: PrismaClient;
  private claude: ClaudeClient;
  private innerLoop: InnerLoopEngine;
  private currentSession: ShadowSession | null = null;
  private capturedInteractions: CapturedInteraction[] = [];

  constructor(config: ShadowModeConfig) {
    this.config = config;
    this.prisma = new PrismaClient();
    this.claude = getClaudeClient();
    this.innerLoop = getInnerLoopEngine();
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Start a new shadow mode session
   */
  async startSession(): Promise<ShadowSession> {
    if (this.currentSession?.status === 'active') {
      throw new Error('Session already active');
    }

    this.currentSession = {
      id: uuid(),
      tenantId: this.config.tenantId,
      startedAt: new Date(),
      status: 'active',
      stats: {
        totalInteractions: 0,
        messagesCapured: 0,
        decisionsCapured: 0,
        comparisonsGenerated: 0,
        matchRate: 0,
        learningCycles: 0,
      },
    };

    this.capturedInteractions = [];

    console.log(`[ShadowMode] Started session ${this.currentSession.id}`);
    return this.currentSession;
  }

  /**
   * Pause the current session
   */
  pauseSession(): void {
    if (this.currentSession) {
      this.currentSession.status = 'paused';
      console.log(`[ShadowMode] Paused session ${this.currentSession.id}`);
    }
  }

  /**
   * Resume a paused session
   */
  resumeSession(): void {
    if (this.currentSession?.status === 'paused') {
      this.currentSession.status = 'active';
      console.log(`[ShadowMode] Resumed session ${this.currentSession.id}`);
    }
  }

  /**
   * End the current session and generate final learnings
   */
  async endSession(): Promise<ShadowLearning | null> {
    if (!this.currentSession) return null;

    this.currentSession.status = 'completed';
    this.currentSession.endedAt = new Date();

    // Generate final learnings
    const learning = await this.generateLearnings();

    console.log(`[ShadowMode] Ended session ${this.currentSession.id}`, this.currentSession.stats);

    this.currentSession = null;
    return learning;
  }

  /**
   * Get current session status
   */
  getSession(): ShadowSession | null {
    return this.currentSession;
  }

  // ===========================================================================
  // INTERACTION CAPTURE
  // ===========================================================================

  /**
   * Capture a human interaction for shadow comparison
   */
  async captureInteraction(
    type: CaptureType,
    context: InteractionContext,
    humanAction: HumanAction
  ): Promise<CapturedInteraction> {
    if (!this.currentSession || this.currentSession.status !== 'active') {
      throw new Error('No active shadow session');
    }

    if (!this.config.captureTypes.includes(type)) {
      throw new Error(`Capture type ${type} not enabled`);
    }

    const interaction: CapturedInteraction = {
      id: uuid(),
      sessionId: this.currentSession.id,
      tenantId: this.config.tenantId,
      type,
      timestamp: new Date(),
      context,
      humanAction,
    };

    this.capturedInteractions.push(interaction);
    this.updateStats(type);

    // Generate Riley's alternative asynchronously
    this.generateRileyAlternative(interaction).catch((err) => {
      console.error(`[ShadowMode] Failed to generate alternative:`, err);
    });

    return interaction;
  }

  /**
   * Capture an outreach message sent by human recruiter
   */
  async captureOutreachMessage(
    candidateId: string,
    requisitionId: string,
    messageContent: string,
    channel: 'email' | 'linkedin',
    recruiterId: string
  ): Promise<CapturedInteraction> {
    return this.captureInteraction(
      'outreach_message',
      {
        candidateId,
        requisitionId,
      },
      {
        actionType: `send_${channel}_message`,
        content: messageContent,
        metadata: { channel },
        performedBy: recruiterId,
        performedAt: new Date(),
      }
    );
  }

  /**
   * Capture a screening decision made by human recruiter
   */
  async captureScreeningDecision(
    candidateId: string,
    requisitionId: string,
    decision: 'advance' | 'reject' | 'hold',
    reasoning: string,
    recruiterId: string
  ): Promise<CapturedInteraction> {
    return this.captureInteraction(
      'screening_decision',
      {
        candidateId,
        requisitionId,
      },
      {
        actionType: 'screening_decision',
        content: reasoning,
        metadata: { decision },
        performedBy: recruiterId,
        performedAt: new Date(),
      }
    );
  }

  // ===========================================================================
  // ALTERNATIVE GENERATION
  // ===========================================================================

  /**
   * Generate what Riley would have done
   */
  private async generateRileyAlternative(interaction: CapturedInteraction): Promise<void> {
    const startTime = Date.now();

    let alternative: RileyAlternative;

    switch (interaction.type) {
      case 'outreach_message':
      case 'follow_up_message':
        alternative = await this.generateMessageAlternative(interaction);
        break;
      case 'screening_decision':
        alternative = await this.generateDecisionAlternative(interaction);
        break;
      default:
        alternative = await this.generateGenericAlternative(interaction);
    }

    alternative.generatedAt = new Date();
    interaction.rileyAlternative = alternative;

    // Compare human vs Riley
    interaction.comparison = await this.compareActions(
      interaction.humanAction,
      alternative,
      interaction.type
    );

    this.currentSession!.stats.comparisonsGenerated++;
    this.updateMatchRate();

    console.log(
      `[ShadowMode] Generated alternative in ${Date.now() - startTime}ms, ` +
        `similarity: ${(interaction.comparison.similarity * 100).toFixed(1)}%`
    );

    // Trigger learning if batch size reached
    if (this.capturedInteractions.length % this.config.learningBatchSize === 0) {
      this.generateLearnings().catch((err) => {
        console.error(`[ShadowMode] Learning generation failed:`, err);
      });
    }
  }

  private async generateMessageAlternative(
    interaction: CapturedInteraction
  ): Promise<RileyAlternative> {
    const response = await this.claude.chat({
      systemPrompt: `You are Riley, an AI recruiting assistant in shadow mode. Generate the message you would have sent to this candidate.

Output as JSON:
{
  "content": "Your message text",
  "reasoning": "Why you chose this approach"
}`,
      prompt: `Context:
${JSON.stringify(interaction.context, null, 2)}

Human sent this message:
${interaction.humanAction.content}

What message would you have sent? Generate YOUR version, not a copy.`,
      temperature: 0.7,
      maxTokens: 1000,
    });

    try {
      const result = this.claude.parseJsonResponse<{ content: string; reasoning: string }>(response);
      return {
        actionType: interaction.humanAction.actionType,
        content: result.content,
        confidence: 0.8,
        reasoning: result.reasoning,
        generatedAt: new Date(),
      };
    } catch {
      return {
        actionType: interaction.humanAction.actionType,
        content: response.content,
        confidence: 0.5,
        reasoning: 'Raw response - JSON parsing failed',
        generatedAt: new Date(),
      };
    }
  }

  private async generateDecisionAlternative(
    interaction: CapturedInteraction
  ): Promise<RileyAlternative> {
    const response = await this.claude.chat({
      systemPrompt: `You are Riley, an AI recruiting assistant in shadow mode. Generate your screening decision for this candidate.

Output as JSON:
{
  "decision": "advance|reject|hold",
  "reasoning": "Detailed reasoning for your decision",
  "confidence": 0.0-1.0
}`,
      prompt: `Context:
${JSON.stringify(interaction.context, null, 2)}

Human made this decision: ${interaction.humanAction.metadata?.decision}
Human reasoning: ${interaction.humanAction.content}

What decision would YOU have made? Be independent.`,
      temperature: 0.3,
      maxTokens: 1000,
    });

    try {
      const result = this.claude.parseJsonResponse<{
        decision: string;
        reasoning: string;
        confidence: number;
      }>(response);
      return {
        actionType: 'screening_decision',
        content: result.reasoning,
        confidence: result.confidence,
        reasoning: `Decision: ${result.decision}. ${result.reasoning}`,
        generatedAt: new Date(),
      };
    } catch {
      return {
        actionType: 'screening_decision',
        content: response.content,
        confidence: 0.5,
        reasoning: 'Raw response - JSON parsing failed',
        generatedAt: new Date(),
      };
    }
  }

  private async generateGenericAlternative(
    interaction: CapturedInteraction
  ): Promise<RileyAlternative> {
    const response = await this.claude.chat({
      systemPrompt: `You are Riley, an AI recruiting assistant in shadow mode. Describe what action you would have taken.`,
      prompt: `Context: ${JSON.stringify(interaction.context, null, 2)}
Human action: ${interaction.humanAction.actionType} - ${interaction.humanAction.content}

What would you have done?`,
      temperature: 0.5,
      maxTokens: 500,
    });

    return {
      actionType: interaction.humanAction.actionType,
      content: response.content,
      confidence: 0.6,
      reasoning: 'Generic alternative',
      generatedAt: new Date(),
    };
  }

  // ===========================================================================
  // COMPARISON
  // ===========================================================================

  private async compareActions(
    human: HumanAction,
    riley: RileyAlternative,
    type: CaptureType
  ): Promise<ComparisonResult> {
    const response = await this.claude.chat({
      systemPrompt: `You are an expert at comparing recruiting actions. Compare a human recruiter's action with an AI alternative.

Output as JSON:
{
  "similarity": 0.0-1.0,
  "dimensions": [
    { "dimension": "dimension_name", "humanScore": 0.0-1.0, "rileyScore": 0.0-1.0, "notes": "..." }
  ],
  "learnings": ["learning 1", "learning 2"],
  "analysis": "Overall analysis"
}`,
      prompt: `Action Type: ${type}

Human Action:
${human.content}

Riley Alternative:
${riley.content}
(Reasoning: ${riley.reasoning})

Compare these actions.`,
      temperature: 0.2,
      maxTokens: 1500,
    });

    try {
      const result = this.claude.parseJsonResponse<{
        similarity: number;
        dimensions: DimensionComparison[];
        learnings: string[];
      }>(response);

      return {
        similarity: result.similarity,
        isMatch: result.similarity >= this.config.comparisonThreshold,
        dimensions: result.dimensions.map((d) => ({
          ...d,
          difference: Math.abs(d.humanScore - d.rileyScore),
        })),
        learnings: result.learnings,
      };
    } catch {
      return {
        similarity: 0.5,
        isMatch: false,
        dimensions: [],
        learnings: [],
      };
    }
  }

  // ===========================================================================
  // LEARNING
  // ===========================================================================

  /**
   * Generate learnings from captured interactions
   */
  async generateLearnings(): Promise<ShadowLearning> {
    const interactionsWithComparison = this.capturedInteractions.filter(
      (i) => i.comparison != null
    );

    if (interactionsWithComparison.length === 0) {
      return {
        id: uuid(),
        sessionId: this.currentSession?.id || '',
        interactionIds: [],
        patterns: [],
        guidelineUpdates: [],
        criteriaUpdates: [],
      };
    }

    // Aggregate learnings from all comparisons
    const allLearnings = interactionsWithComparison.flatMap((i) => i.comparison!.learnings);

    // Group by pattern
    const patternCounts = new Map<string, number>();
    for (const learning of allLearnings) {
      const key = learning.toLowerCase().trim();
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    }

    // Convert to LearnedPattern
    const patterns: LearnedPattern[] = Array.from(patternCounts.entries())
      .filter(([, count]) => count >= 2) // At least 2 occurrences
      .map(([pattern, count]) => ({
        type: 'observation',
        description: pattern,
        frequency: count,
        examples: interactionsWithComparison
          .filter((i) => i.comparison!.learnings.some((l) => l.toLowerCase().trim() === pattern))
          .slice(0, 3)
          .map((i) => i.humanAction.content.substring(0, 100)),
        confidence: Math.min(count / interactionsWithComparison.length, 1.0),
      }));

    // Generate guideline updates from patterns
    const guidelineUpdates = await this.generateGuidelineUpdates(patterns, interactionsWithComparison);

    const learning: ShadowLearning = {
      id: uuid(),
      sessionId: this.currentSession?.id || '',
      interactionIds: interactionsWithComparison.map((i) => i.id),
      patterns,
      guidelineUpdates,
      criteriaUpdates: [],
    };

    if (this.currentSession) {
      this.currentSession.stats.learningCycles++;
    }

    console.log(
      `[ShadowMode] Generated learnings: ${patterns.length} patterns, ${guidelineUpdates.length} updates`
    );

    return learning;
  }

  private async generateGuidelineUpdates(
    patterns: LearnedPattern[],
    interactions: CapturedInteraction[]
  ): Promise<GuidelineUpdate[]> {
    if (patterns.length === 0) return [];

    const mismatches = interactions.filter((i) => !i.comparison?.isMatch);
    const mismatchSummary = mismatches.slice(0, 5).map((i) => ({
      type: i.type,
      humanApproach: i.humanAction.content.substring(0, 200),
      rileyApproach: i.rileyAlternative?.content.substring(0, 200),
      similarity: i.comparison?.similarity,
    }));

    const response = await this.claude.chat({
      systemPrompt: `You are analyzing shadow mode results to suggest guideline updates. Based on where Riley differs from human recruiters, suggest improvements.

Output as JSON array:
[
  {
    "type": "workflow|template|constraint",
    "path": "path to update (e.g., templates.outreach.email)",
    "reason": "Why this update is needed",
    "suggestedChange": "Description of the change"
  }
]`,
      prompt: `Patterns observed:
${JSON.stringify(patterns, null, 2)}

Key mismatches (Riley vs Human):
${JSON.stringify(mismatchSummary, null, 2)}

What guideline updates would help Riley better match human behavior?`,
      temperature: 0.3,
      maxTokens: 2000,
    });

    try {
      return this.claude.parseJsonResponse<GuidelineUpdate[]>(response);
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private updateStats(type: CaptureType): void {
    if (!this.currentSession) return;

    this.currentSession.stats.totalInteractions++;

    if (type.includes('message')) {
      this.currentSession.stats.messagesCapured++;
    } else {
      this.currentSession.stats.decisionsCapured++;
    }
  }

  private updateMatchRate(): void {
    if (!this.currentSession) return;

    const withComparison = this.capturedInteractions.filter((i) => i.comparison != null);
    if (withComparison.length === 0) return;

    const matches = withComparison.filter((i) => i.comparison!.isMatch);
    this.currentSession.stats.matchRate = matches.length / withComparison.length;
  }

  /**
   * Get all captured interactions
   */
  getInteractions(): CapturedInteraction[] {
    return this.capturedInteractions;
  }

  /**
   * Get interactions needing review (low match rate)
   */
  getInteractionsForReview(): CapturedInteraction[] {
    return this.capturedInteractions.filter(
      (i) => i.comparison && !i.comparison.isMatch && i.comparison.similarity < 0.5
    );
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createShadowModeRunner(config: ShadowModeConfig): ShadowModeRunner {
  return new ShadowModeRunner(config);
}
