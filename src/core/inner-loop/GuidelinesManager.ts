/**
 * Guidelines Manager - Versioning and Updates for Guidelines (G)
 *
 * Manages the lifecycle of Guidelines:
 * - Version control with full history
 * - Draft creation from inner loop learnings
 * - Activation/rejection by teleoperators
 * - Comparison between versions
 *
 * Key Two-Loop Principle:
 * - Inner loop CAN create draft Guidelines updates
 * - Only outer loop (teleoperators) can ACTIVATE them
 */

import { getGuidelinesRepository, GuidelinesRepository } from '../../domain/repositories/GuidelinesRepository.js';
import type { Guidelines } from '../../generated/prisma/index.js';
import type {
  GuidelinesContent,
  WorkflowGuideline,
  TemplateGuideline,
  DecisionTree,
  Constraint,
} from '../../domain/entities/Guidelines.js';
import type { GuidelinesUpdate } from '../../domain/entities/InnerLoop.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GuidelinesDiff {
  added: DiffEntry[];
  modified: DiffEntry[];
  removed: DiffEntry[];
  summary: string;
}

export interface DiffEntry {
  path: string;
  type: 'workflow' | 'template' | 'decisionTree' | 'constraint';
  name: string;
  before?: unknown;
  after?: unknown;
}

export interface GuidelinesValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

// =============================================================================
// GUIDELINES MANAGER
// =============================================================================

export class GuidelinesManager {
  private repo: GuidelinesRepository;

  constructor(repo?: GuidelinesRepository) {
    this.repo = repo || getGuidelinesRepository();
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get active guidelines for a tenant
   */
  async getActive(tenantId: string): Promise<GuidelinesContent | null> {
    const guidelines = await this.repo.getActive(tenantId);
    if (!guidelines) return null;
    return this.toContent(guidelines);
  }

  /**
   * Get active guidelines (throws if not found)
   */
  async getActiveOrThrow(tenantId: string): Promise<GuidelinesContent> {
    const content = await this.getActive(tenantId);
    if (!content) {
      throw new Error(`No active guidelines found for tenant: ${tenantId}`);
    }
    return content;
  }

  /**
   * Get a specific version
   */
  async getVersion(tenantId: string, version: number): Promise<GuidelinesContent | null> {
    const guidelines = await this.repo.getVersion(tenantId, version);
    if (!guidelines) return null;
    return this.toContent(guidelines);
  }

  /**
   * Get all versions with metadata
   */
  async getAllVersions(tenantId: string): Promise<GuidelinesVersionInfo[]> {
    const versions = await this.repo.getAllVersions(tenantId);
    return versions.map((g) => ({
      id: g.id,
      version: g.version,
      status: g.status,
      createdBy: g.createdBy,
      changelog: g.changelog,
      createdAt: g.createdAt,
      effectiveFrom: g.effectiveFrom,
      effectiveUntil: g.effectiveUntil,
    }));
  }

  /**
   * Get pending drafts awaiting review
   */
  async getPendingDrafts(tenantId: string): Promise<GuidelinesVersionInfo[]> {
    const drafts = await this.repo.getDrafts(tenantId);
    return drafts.map((g) => ({
      id: g.id,
      version: g.version,
      status: g.status,
      createdBy: g.createdBy,
      changelog: g.changelog,
      createdAt: g.createdAt,
      effectiveFrom: g.effectiveFrom,
      effectiveUntil: g.effectiveUntil,
    }));
  }

  // ===========================================================================
  // WRITE OPERATIONS (Inner Loop)
  // ===========================================================================

  /**
   * Create a draft from inner loop learnings
   *
   * This is called when the inner loop learns something new
   * and wants to propose guidelines updates.
   */
  async createDraftFromLearnings(
    tenantId: string,
    updates: GuidelinesUpdate[],
    changelog: string
  ): Promise<Guidelines> {
    // Get current active guidelines
    const current = await this.getActive(tenantId);
    if (!current) {
      throw new Error('Cannot create draft: no active guidelines exist');
    }

    // Apply updates to create new content
    const updated = this.applyUpdates(current, updates);

    // Validate the updated guidelines
    const validation = this.validate(updated);
    if (!validation.valid) {
      throw new Error(
        `Invalid guidelines: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    // Create the draft
    return this.repo.createDraft(tenantId, {
      workflows: updated.workflows as unknown as Record<string, unknown>[],
      templates: updated.templates as unknown as Record<string, unknown>[],
      decisionTrees: updated.decisionTrees as unknown as Record<string, unknown>[],
      constraints: updated.constraints as unknown as Record<string, unknown>[],
      createdBy: 'AGENT',
      changelog: this.formatChangelog(changelog, updates),
    });
  }

  /**
   * Apply updates to guidelines content
   */
  private applyUpdates(
    content: GuidelinesContent,
    updates: GuidelinesUpdate[]
  ): GuidelinesContent {
    // Deep clone to avoid mutations
    const result = JSON.parse(JSON.stringify(content)) as GuidelinesContent;

    for (const update of updates) {
      this.applyUpdate(result, update);
    }

    return result;
  }

  private applyUpdate(content: GuidelinesContent, update: GuidelinesUpdate): void {
    const parts = update.targetPath.split('.');
    let target: Record<string, unknown> = content as unknown as Record<string, unknown>;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

      if (arrayMatch) {
        const [, arrayName, indexStr] = arrayMatch;
        const arr = target[arrayName] as unknown[];
        if (!arr) {
          target[arrayName] = [];
        }
        const index = parseInt(indexStr, 10);
        if (!arr[index]) {
          arr[index] = {};
        }
        target = arr[index] as Record<string, unknown>;
      } else {
        if (!target[part]) {
          target[part] = {};
        }
        target = target[part] as Record<string, unknown>;
      }
    }

    // Apply operation
    const finalKey = parts[parts.length - 1];

    switch (update.operation) {
      case 'add':
      case 'modify':
        target[finalKey] = update.newValue;
        break;
      case 'remove':
        delete target[finalKey];
        break;
    }
  }

  // ===========================================================================
  // WRITE OPERATIONS (Outer Loop / Teleoperator)
  // ===========================================================================

  /**
   * Activate a draft version
   *
   * Only teleoperators should call this (outer loop).
   */
  async activateDraft(guidelinesId: string): Promise<Guidelines> {
    return this.repo.activateDraft(guidelinesId);
  }

  /**
   * Reject a draft version
   *
   * Only teleoperators should call this (outer loop).
   */
  async rejectDraft(guidelinesId: string, reason: string): Promise<Guidelines> {
    return this.repo.rejectDraft(guidelinesId, reason);
  }

  /**
   * Create guidelines manually (teleoperator)
   */
  async createManual(
    tenantId: string,
    content: GuidelinesContent,
    changelog?: string
  ): Promise<Guidelines> {
    // Validate
    const validation = this.validate(content);
    if (!validation.valid) {
      throw new Error(
        `Invalid guidelines: ${validation.errors.map((e) => e.message).join(', ')}`
      );
    }

    return this.repo.createDraft(tenantId, {
      workflows: content.workflows as unknown as Record<string, unknown>[],
      templates: content.templates as unknown as Record<string, unknown>[],
      decisionTrees: content.decisionTrees as unknown as Record<string, unknown>[],
      constraints: content.constraints as unknown as Record<string, unknown>[],
      createdBy: 'TELEOPERATOR',
      changelog,
    });
  }

  // ===========================================================================
  // COMPARISON / DIFF
  // ===========================================================================

  /**
   * Compare two versions of guidelines
   */
  async compare(
    tenantId: string,
    versionA: number,
    versionB: number
  ): Promise<GuidelinesDiff> {
    const { a, b } = await this.repo.compareVersions(tenantId, versionA, versionB);

    const contentA = this.toContent(a);
    const contentB = this.toContent(b);

    return this.diffContent(contentA, contentB);
  }

  /**
   * Diff two guidelines content objects
   */
  diffContent(before: GuidelinesContent, after: GuidelinesContent): GuidelinesDiff {
    const diff: GuidelinesDiff = {
      added: [],
      modified: [],
      removed: [],
      summary: '',
    };

    // Compare workflows
    this.diffArray(
      before.workflows,
      after.workflows,
      'workflows',
      'workflow',
      diff
    );

    // Compare templates
    this.diffArray(
      before.templates,
      after.templates,
      'templates',
      'template',
      diff
    );

    // Compare decision trees
    this.diffArray(
      before.decisionTrees,
      after.decisionTrees,
      'decisionTrees',
      'decisionTree',
      diff
    );

    // Compare constraints
    this.diffArray(
      before.constraints,
      after.constraints,
      'constraints',
      'constraint',
      diff
    );

    // Generate summary
    const parts = [];
    if (diff.added.length > 0) parts.push(`${diff.added.length} added`);
    if (diff.modified.length > 0) parts.push(`${diff.modified.length} modified`);
    if (diff.removed.length > 0) parts.push(`${diff.removed.length} removed`);
    diff.summary = parts.length > 0 ? parts.join(', ') : 'No changes';

    return diff;
  }

  private diffArray<T extends { id: string; name: string }>(
    before: T[],
    after: T[],
    path: string,
    type: DiffEntry['type'],
    diff: GuidelinesDiff
  ): void {
    const beforeMap = new Map(before.map((item) => [item.id, item]));
    const afterMap = new Map(after.map((item) => [item.id, item]));

    // Find added and modified
    for (const [id, afterItem] of afterMap) {
      const beforeItem = beforeMap.get(id);

      if (!beforeItem) {
        diff.added.push({
          path: `${path}[${id}]`,
          type,
          name: afterItem.name,
          after: afterItem,
        });
      } else if (JSON.stringify(beforeItem) !== JSON.stringify(afterItem)) {
        diff.modified.push({
          path: `${path}[${id}]`,
          type,
          name: afterItem.name,
          before: beforeItem,
          after: afterItem,
        });
      }
    }

    // Find removed
    for (const [id, beforeItem] of beforeMap) {
      if (!afterMap.has(id)) {
        diff.removed.push({
          path: `${path}[${id}]`,
          type,
          name: beforeItem.name,
          before: beforeItem,
        });
      }
    }
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate guidelines content
   */
  validate(content: GuidelinesContent): GuidelinesValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate workflows
    for (let i = 0; i < content.workflows.length; i++) {
      const workflow = content.workflows[i];
      this.validateWorkflow(workflow, `workflows[${i}]`, errors, warnings);
    }

    // Validate templates
    for (let i = 0; i < content.templates.length; i++) {
      const template = content.templates[i];
      this.validateTemplate(template, `templates[${i}]`, errors, warnings);
    }

    // Validate decision trees
    for (let i = 0; i < content.decisionTrees.length; i++) {
      const tree = content.decisionTrees[i];
      this.validateDecisionTree(tree, `decisionTrees[${i}]`, errors, warnings);
    }

    // Validate constraints
    for (let i = 0; i < content.constraints.length; i++) {
      const constraint = content.constraints[i];
      this.validateConstraint(constraint, `constraints[${i}]`, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateWorkflow(
    workflow: WorkflowGuideline,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!workflow.id) {
      errors.push({ path: `${path}.id`, message: 'Workflow ID is required', code: 'REQUIRED' });
    }
    if (!workflow.name) {
      errors.push({ path: `${path}.name`, message: 'Workflow name is required', code: 'REQUIRED' });
    }
    if (!workflow.stages || workflow.stages.length === 0) {
      warnings.push({
        path: `${path}.stages`,
        message: 'Workflow has no stages',
        suggestion: 'Add at least one stage to the workflow',
      });
    }
  }

  private validateTemplate(
    template: TemplateGuideline,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!template.id) {
      errors.push({ path: `${path}.id`, message: 'Template ID is required', code: 'REQUIRED' });
    }
    if (!template.body) {
      errors.push({ path: `${path}.body`, message: 'Template body is required', code: 'REQUIRED' });
    }

    // Check for unresolved variables
    const variablePattern = /\{\{(\w+(?:\.\w+)*)\}\}/g;
    const usedVariables = new Set<string>();
    let match;

    while ((match = variablePattern.exec(template.body)) !== null) {
      usedVariables.add(match[1]);
    }

    const definedVariables = new Set(template.variables?.map((v) => v.name) || []);

    for (const used of usedVariables) {
      if (!definedVariables.has(used)) {
        warnings.push({
          path: `${path}.body`,
          message: `Template uses undefined variable: ${used}`,
          suggestion: `Add "${used}" to the variables array`,
        });
      }
    }
  }

  private validateDecisionTree(
    tree: DecisionTree,
    path: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!tree.id) {
      errors.push({ path: `${path}.id`, message: 'Decision tree ID is required', code: 'REQUIRED' });
    }
    if (!tree.rootNodeId) {
      errors.push({
        path: `${path}.rootNodeId`,
        message: 'Decision tree must have a root node',
        code: 'REQUIRED',
      });
    }

    // Validate node connectivity
    const nodeIds = new Set(tree.nodes?.map((n) => n.id) || []);

    if (tree.rootNodeId && !nodeIds.has(tree.rootNodeId)) {
      errors.push({
        path: `${path}.rootNodeId`,
        message: `Root node "${tree.rootNodeId}" not found in nodes`,
        code: 'INVALID_REFERENCE',
      });
    }
  }

  private validateConstraint(
    constraint: Constraint,
    path: string,
    errors: ValidationError[],
    _warnings: ValidationWarning[]
  ): void {
    if (!constraint.id) {
      errors.push({ path: `${path}.id`, message: 'Constraint ID is required', code: 'REQUIRED' });
    }
    if (!constraint.type) {
      errors.push({ path: `${path}.type`, message: 'Constraint type is required', code: 'REQUIRED' });
    }
  }

  // ===========================================================================
  // TEMPLATE FINDING
  // ===========================================================================

  /**
   * Find a template matching the channel and purpose
   */
  async findTemplate(
    guidelines: Guidelines,
    channel: string,
    purpose: string
  ): Promise<TemplateGuideline | null> {
    const content = this.toContent(guidelines);

    const template = content.templates.find((t) => {
      const matchesChannel = !channel || t.channel === channel;
      const matchesPurpose = t.purpose === purpose || t.name.toLowerCase().includes(purpose.toLowerCase());
      return matchesChannel && matchesPurpose;
    });

    return template || null;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private toContent(guidelines: Guidelines): GuidelinesContent {
    return {
      workflows: guidelines.workflows as unknown as WorkflowGuideline[],
      templates: guidelines.templates as unknown as TemplateGuideline[],
      decisionTrees: guidelines.decisionTrees as unknown as DecisionTree[],
      constraints: guidelines.constraints as unknown as Constraint[],
    };
  }

  private formatChangelog(base: string, updates: GuidelinesUpdate[]): string {
    const updateSummary = updates
      .map((u) => `- ${u.operation}: ${u.targetPath}`)
      .join('\n');

    return `${base}\n\nUpdates:\n${updateSummary}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface GuidelinesVersionInfo {
  id: string;
  version: number;
  status: string;
  createdBy: string;
  changelog: string | null;
  createdAt: Date;
  effectiveFrom: Date | null;
  effectiveUntil: Date | null;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: GuidelinesManager | null = null;

export function getGuidelinesManager(): GuidelinesManager {
  if (!instance) {
    instance = new GuidelinesManager();
  }
  return instance;
}
