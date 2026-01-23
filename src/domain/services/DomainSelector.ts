/**
 * DomainSelector Service
 *
 * Selects the appropriate (Guidelines, Criteria) pair for a given context.
 * This is the runtime component of the domain-specific (G, C) system.
 *
 * Selection priority:
 * 1. Explicit domain override in context
 * 2. Matching selection rules (evaluated by priority)
 * 3. Default domain for tenant
 * 4. Tenant-level (G, C) fallback (legacy behavior)
 */

import { getDomainRepository, DomainRepository } from '../repositories/DomainRepository.js';
import { getGuidelinesRepository } from '../repositories/GuidelinesRepository.js';
import { getCriteriaRepository } from '../repositories/CriteriaRepository.js';
import type {
  DomainConfig,
  DomainSelectionContext,
  DomainSelectionResult,
  DomainSelectionRule,
  DomainConfigOverrides,
} from '../entities/DomainConfig.js';
import type { GuidelinesContent } from '../entities/Guidelines.js';
import type { CriteriaContent } from '../entities/Criteria.js';
import type { ConditionOperator } from '../entities/Guidelines.js';

// =============================================================================
// DOMAIN SELECTOR SERVICE
// =============================================================================

export class DomainSelector {
  private domainRepo: DomainRepository;
  private guidelinesRepo = getGuidelinesRepository();
  private criteriaRepo = getCriteriaRepository();

  constructor(domainRepo?: DomainRepository) {
    this.domainRepo = domainRepo || getDomainRepository();
  }

  // ===========================================================================
  // MAIN SELECTION METHOD
  // ===========================================================================

  /**
   * Select the appropriate domain and (G, C) pair for a given context
   *
   * @param tenantId - The tenant ID
   * @param context - Context for domain selection (requisition, candidate, etc.)
   * @returns Selection result with domain and G/C IDs
   */
  async selectDomain(
    tenantId: string,
    context: DomainSelectionContext
  ): Promise<DomainSelectionResult> {
    console.log(`[DomainSelector] Selecting domain for tenant ${tenantId}`, {
      explicitSlug: context.domainSlug,
      requisitionId: context.requisition?.id,
      taskType: context.taskType,
    });

    // 1. Check for explicit domain override
    if (context.domainSlug) {
      const domain = await this.domainRepo.getBySlug(tenantId, context.domainSlug);
      if (domain && domain.status === 'ACTIVE') {
        console.log(`[DomainSelector] Using explicit domain: ${domain.name}`);
        return this.buildResult(domain, 'explicit');
      }
      console.warn(`[DomainSelector] Explicit domain '${context.domainSlug}' not found or inactive`);
    }

    // 2. Get all active domains and evaluate selection rules
    const domains = await this.domainRepo.getActiveDomains(tenantId);

    // Filter out default domain for rule matching
    const ruledDomains = domains.filter((d) => !d.isDefault);

    // Domains are already sorted by priority (desc)
    for (const domain of ruledDomains) {
      if (domain.selectionRules.length === 0) continue;

      const matchResult = this.evaluateRules(domain.selectionRules, context);
      if (matchResult.matched) {
        console.log(`[DomainSelector] Matched domain '${domain.name}' via rule`, matchResult.matchedRule);
        return this.buildResult(domain, 'rule_match', matchResult.matchedRule);
      }
    }

    // 3. Use default domain if exists
    const defaultDomain = domains.find((d) => d.isDefault);
    if (defaultDomain) {
      console.log(`[DomainSelector] Using default domain: ${defaultDomain.name}`);
      return this.buildResult(defaultDomain, 'default');
    }

    // 4. Fall back to tenant-level (G, C)
    console.log(`[DomainSelector] No domain matched, using tenant-level fallback`);
    return this.buildTenantFallback(tenantId);
  }

  // ===========================================================================
  // LOAD FULL G/C CONTENT
  // ===========================================================================

  /**
   * Load the full Guidelines and Criteria content for a selection result
   * Applies domain-specific overrides if present
   */
  async loadGuidelines(
    selectionResult: DomainSelectionResult
  ): Promise<GuidelinesContent> {
    const guidelines = await this.guidelinesRepo.getById(selectionResult.guidelinesId);
    if (!guidelines) {
      throw new Error(`Guidelines ${selectionResult.guidelinesId} not found`);
    }

    let content: GuidelinesContent = {
      workflows: guidelines.workflows as GuidelinesContent['workflows'],
      templates: guidelines.templates as GuidelinesContent['templates'],
      decisionTrees: guidelines.decisionTrees as GuidelinesContent['decisionTrees'],
      constraints: guidelines.constraints as GuidelinesContent['constraints'],
    };

    // Apply domain overrides if present
    if (selectionResult.domain?.configOverrides) {
      content = this.applyGuidelinesOverrides(content, selectionResult.domain.configOverrides);
    }

    return content;
  }

  /**
   * Load the full Criteria content for a selection result
   */
  async loadCriteria(selectionResult: DomainSelectionResult): Promise<CriteriaContent> {
    const criteria = await this.criteriaRepo.getById(selectionResult.criteriaId);
    if (!criteria) {
      throw new Error(`Criteria ${selectionResult.criteriaId} not found`);
    }

    return {
      qualityStandards: criteria.qualityStandards as CriteriaContent['qualityStandards'],
      evaluationRubrics: criteria.evaluationRubrics as CriteriaContent['evaluationRubrics'],
      successMetrics: criteria.successMetrics as CriteriaContent['successMetrics'],
      failurePatterns: criteria.failurePatterns as CriteriaContent['failurePatterns'],
    };
  }

  // ===========================================================================
  // RULE EVALUATION
  // ===========================================================================

  /**
   * Evaluate selection rules against context
   */
  private evaluateRules(
    rules: DomainSelectionRule[],
    context: DomainSelectionContext
  ): { matched: boolean; matchedRule?: DomainSelectionRule } {
    if (rules.length === 0) {
      return { matched: false };
    }

    let result = true;
    let pendingOr = false;
    let firstMatchedRule: DomainSelectionRule | undefined;

    for (const rule of rules) {
      const fieldValue = this.getNestedValue(context, rule.field);
      const ruleResult = this.evaluateCondition(fieldValue, rule.operator, rule.value);

      if (ruleResult && !firstMatchedRule) {
        firstMatchedRule = rule;
      }

      if (rule.logicalOp === 'OR') {
        if (pendingOr || ruleResult) {
          result = true;
          pendingOr = false;
        } else {
          pendingOr = true;
        }
      } else {
        // AND (default)
        result = result && ruleResult;
      }
    }

    // Handle trailing OR
    if (pendingOr) {
      result = false;
    }

    return {
      matched: result,
      matchedRule: result ? firstMatchedRule : undefined,
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    fieldValue: unknown,
    operator: ConditionOperator,
    ruleValue: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return fieldValue === ruleValue;

      case 'not_equals':
        return fieldValue !== ruleValue;

      case 'contains':
        if (typeof fieldValue === 'string' && typeof ruleValue === 'string') {
          return fieldValue.toLowerCase().includes(ruleValue.toLowerCase());
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.some((v) =>
            typeof v === 'string' && typeof ruleValue === 'string'
              ? v.toLowerCase() === ruleValue.toLowerCase()
              : v === ruleValue
          );
        }
        return false;

      case 'not_contains':
        return !this.evaluateCondition(fieldValue, 'contains', ruleValue);

      case 'greater_than':
        return typeof fieldValue === 'number' && typeof ruleValue === 'number'
          ? fieldValue > ruleValue
          : false;

      case 'less_than':
        return typeof fieldValue === 'number' && typeof ruleValue === 'number'
          ? fieldValue < ruleValue
          : false;

      case 'in':
        if (Array.isArray(ruleValue)) {
          if (typeof fieldValue === 'string') {
            return ruleValue.some((v) =>
              typeof v === 'string'
                ? v.toLowerCase() === fieldValue.toLowerCase()
                : v === fieldValue
            );
          }
          return ruleValue.includes(fieldValue);
        }
        return false;

      case 'not_in':
        return !this.evaluateCondition(fieldValue, 'in', ruleValue);

      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;

      case 'not_exists':
        return fieldValue === undefined || fieldValue === null;

      default:
        console.warn(`[DomainSelector] Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Get a nested value from an object using dot notation
   * e.g., 'requisition.seniority' -> context.requisition.seniority
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  // ===========================================================================
  // RESULT BUILDERS
  // ===========================================================================

  private async buildResult(
    domain: DomainConfig,
    method: 'explicit' | 'rule_match' | 'default',
    matchedRule?: DomainSelectionRule
  ): Promise<DomainSelectionResult> {
    // Get associated G/C IDs, falling back to tenant-level if not set
    let guidelinesId = domain.guidelinesId;
    let criteriaId = domain.criteriaId;

    if (!guidelinesId || !criteriaId) {
      // Fall back to tenant-level active G/C
      const [activeGuidelines, activeCriteria] = await Promise.all([
        guidelinesId ? null : this.guidelinesRepo.getActive(domain.tenantId),
        criteriaId ? null : this.criteriaRepo.getActive(domain.tenantId),
      ]);

      if (!guidelinesId && activeGuidelines) {
        guidelinesId = activeGuidelines.id;
      }
      if (!criteriaId && activeCriteria) {
        criteriaId = activeCriteria.id;
      }
    }

    if (!guidelinesId) {
      throw new Error(`No Guidelines found for domain ${domain.name} or tenant ${domain.tenantId}`);
    }
    if (!criteriaId) {
      throw new Error(`No Criteria found for domain ${domain.name} or tenant ${domain.tenantId}`);
    }

    return {
      domain,
      guidelinesId,
      criteriaId,
      selectionMethod: method,
      matchedRule,
    };
  }

  private async buildTenantFallback(tenantId: string): Promise<DomainSelectionResult> {
    const [activeGuidelines, activeCriteria] = await Promise.all([
      this.guidelinesRepo.getActive(tenantId),
      this.criteriaRepo.getActive(tenantId),
    ]);

    if (!activeGuidelines) {
      throw new Error(`No active Guidelines found for tenant ${tenantId}`);
    }
    if (!activeCriteria) {
      throw new Error(`No active Criteria found for tenant ${tenantId}`);
    }

    return {
      domain: undefined,
      guidelinesId: activeGuidelines.id,
      criteriaId: activeCriteria.id,
      selectionMethod: 'tenant_fallback',
    };
  }

  // ===========================================================================
  // OVERRIDE APPLICATION
  // ===========================================================================

  /**
   * Apply domain-specific overrides to Guidelines content
   */
  private applyGuidelinesOverrides(
    content: GuidelinesContent,
    overrides: DomainConfigOverrides
  ): GuidelinesContent {
    const result = { ...content };

    // Apply constraint overrides
    if (overrides.constraints) {
      const constraintMap = new Map(result.constraints.map((c) => [c.id, c]));

      for (const override of overrides.constraints) {
        if (constraintMap.has(override.id)) {
          // Merge with existing constraint
          const existing = constraintMap.get(override.id)!;
          constraintMap.set(override.id, {
            ...existing,
            ...override,
            config: { ...existing.config, ...override.config } as GuidelinesContent['constraints'][0]['config'],
          });
        } else {
          // Add new constraint
          constraintMap.set(override.id, override as GuidelinesContent['constraints'][0]);
        }
      }

      result.constraints = Array.from(constraintMap.values());
    }

    // Apply escalation rule overrides
    if (overrides.escalationRules) {
      for (const workflow of result.workflows) {
        workflow.escalationRules = [
          ...workflow.escalationRules,
          ...overrides.escalationRules.map((r) => ({
            id: r.id,
            name: r.id,
            conditions: r.conditions,
            reason: r.reason as GuidelinesContent['workflows'][0]['escalationRules'][0]['reason'],
            priority: r.priority,
            notificationChannels: ['dashboard'] as GuidelinesContent['workflows'][0]['escalationRules'][0]['notificationChannels'],
          })),
        ];
      }
    }

    return result;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: DomainSelector | null = null;

export function getDomainSelector(): DomainSelector {
  if (!instance) {
    instance = new DomainSelector();
  }
  return instance;
}

export function resetDomainSelector(): void {
  instance = null;
}
