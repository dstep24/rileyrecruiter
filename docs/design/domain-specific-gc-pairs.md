# Domain-Specific (G, C) Pairs Design

## Overview

This design extends Riley's two-loop paradigm to support **multiple (G, C) pairs** within a single tenant, enabling domain-specific agent behavior. This addresses the key insight: "different modes/domains to govern agent performance is the key to generalizing the pattern."

## Current State

```
Tenant
  └── Guidelines (G) - single active version
  └── Criteria (C) - single active version
```

The inner loop loads ONE (G, C) pair per tenant and uses it for ALL tasks.

## Proposed State

```
Tenant
  └── DomainConfig[]
        ├── Domain: "senior-engineering"
        │     ├── Guidelines (G₁) - optimized for senior roles
        │     └── Criteria (C₁) - stricter quality bars
        │
        ├── Domain: "entry-level"
        │     ├── Guidelines (G₂) - more volume-focused
        │     └── Criteria (C₂) - different success metrics
        │
        └── Domain: "healthcare-vertical"
              ├── Guidelines (G₃) - compliance-heavy workflows
              └── Criteria (C₃) - HIPAA-aware evaluation
```

## Schema Changes

### 1. New `DomainConfig` Model

```prisma
model DomainConfig {
  id              String           @id @default(uuid())
  tenantId        String
  name            String           // e.g., "senior-engineering"
  slug            String           // URL-safe identifier
  description     String?

  // Selection criteria - when does this domain apply?
  selectionRules  Json             @default("[]")  // Condition[]
  priority        Int              @default(0)     // Higher = checked first
  isDefault       Boolean          @default(false) // Fallback domain

  // Associated G and C
  guidelinesId    String?          // Active Guidelines for this domain
  criteriaId      String?          // Active Criteria for this domain

  // Domain-specific overrides
  configOverrides Json             @default("{}")  // Partial GuidelinesContent

  status          DomainStatus     @default(ACTIVE)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  guidelines      Guidelines?      @relation(fields: [guidelinesId], references: [id])
  criteria        Criteria?        @relation(fields: [criteriaId], references: [id])

  @@unique([tenantId, slug])
  @@index([tenantId, status])
  @@map("domain_configs")
}

enum DomainStatus {
  ACTIVE
  INACTIVE
  ARCHIVED
}
```

### 2. Add Domain Reference to Guidelines/Criteria

```prisma
model Guidelines {
  // ... existing fields ...

  // New: Domain association (optional - global if null)
  domainId        String?
  domain          DomainConfig?    @relation(fields: [domainId], references: [id])

  // New: Whether this is domain-specific or tenant-global
  scope           GuidelinesScope  @default(TENANT)
}

enum GuidelinesScope {
  TENANT    // Applies tenant-wide (current behavior)
  DOMAIN    // Applies only to specific domain
}
```

### 3. Selection Rules Structure

```typescript
interface DomainSelectionRule {
  field: string;           // What to check
  operator: ConditionOperator;
  value: unknown;
  logicalOp?: 'AND' | 'OR';
}

// Example selection rules for "senior-engineering" domain:
const seniorEngRules: DomainSelectionRule[] = [
  { field: 'requisition.seniority', operator: 'in', value: ['senior', 'staff', 'principal'] },
  { field: 'requisition.department', operator: 'equals', value: 'engineering', logicalOp: 'AND' },
];

// Example selection rules for "healthcare-vertical" domain:
const healthcareRules: DomainSelectionRule[] = [
  { field: 'requisition.industry', operator: 'equals', value: 'healthcare' },
  { field: 'requisition.complianceRequirements', operator: 'contains', value: 'HIPAA', logicalOp: 'OR' },
];
```

## Domain Selection Algorithm

```typescript
class DomainSelector {
  /**
   * Select the appropriate (G, C) pair for a given context
   *
   * Priority order:
   * 1. Explicit domain override in context
   * 2. Matching selection rules (by priority)
   * 3. Default domain for tenant
   * 4. Tenant-level (G, C) - current behavior
   */
  async selectDomain(
    tenantId: string,
    context: TaskContext
  ): Promise<{ guidelines: Guidelines; criteria: Criteria; domain?: DomainConfig }> {

    // 1. Check for explicit domain override
    if (context.domainSlug) {
      const domain = await this.getDomainBySlug(tenantId, context.domainSlug);
      if (domain) {
        return this.loadDomainGC(domain);
      }
    }

    // 2. Evaluate selection rules
    const domains = await this.getActiveDomains(tenantId);

    // Sort by priority (descending)
    const sortedDomains = domains
      .filter(d => !d.isDefault)
      .sort((a, b) => b.priority - a.priority);

    for (const domain of sortedDomains) {
      if (this.matchesRules(domain.selectionRules, context)) {
        return this.loadDomainGC(domain);
      }
    }

    // 3. Use default domain if exists
    const defaultDomain = domains.find(d => d.isDefault);
    if (defaultDomain) {
      return this.loadDomainGC(defaultDomain);
    }

    // 4. Fall back to tenant-level G and C
    return this.loadTenantGC(tenantId);
  }

  private matchesRules(rules: DomainSelectionRule[], context: TaskContext): boolean {
    // Evaluate rules with AND/OR logic
    let result = true;
    let pendingOr = false;

    for (const rule of rules) {
      const fieldValue = this.getNestedValue(context, rule.field);
      const ruleResult = this.evaluateCondition(fieldValue, rule.operator, rule.value);

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

    return result;
  }
}
```

## Inner Loop Integration

Update `InnerLoopEngine.execute()` to use domain selection:

```typescript
async execute(context: InnerLoopContext): Promise<InnerLoopResult> {
  // NEW: Select appropriate (G, C) pair based on context
  const domainSelector = getDomainSelector();
  const { guidelines, criteria, domain } = await domainSelector.selectDomain(
    context.tenantId,
    {
      requisition: context.input.requisition,
      taskType: context.taskType,
      candidate: context.input.candidate,
      domainSlug: context.input.domainSlug, // Explicit override
    }
  );

  // Log which domain was selected
  console.log(`[InnerLoop] Using domain: ${domain?.name || 'tenant-default'}`);

  // Rest of execution uses selected G and C...
}
```

## Domain-Specific Learning

When the inner loop learns and updates Guidelines, it should:
1. Update the domain-specific Guidelines (not tenant-level)
2. Track which domain the learning came from
3. Allow learnings to "bubble up" to tenant-level if widely applicable

```typescript
private async applyLearnings(
  currentGuidelines: GuidelinesContent,
  learning: IterationLearning,
  tenantId: string,
  domainId?: string  // NEW: Track which domain
): Promise<GuidelinesContent> {
  // ... existing learning logic ...

  // NEW: Save learning metadata
  await this.saveLearningRecord({
    tenantId,
    domainId,
    insights: learning.insights,
    proposedUpdates: learning.proposedUpdates,
    appliedAt: new Date(),
  });

  // NEW: Check if learning should propagate to other domains
  if (this.isUniversalLearning(learning)) {
    await this.propagateLearning(tenantId, learning, domainId);
  }

  return updated;
}
```

## UI/Dashboard Changes

### 1. Domain Configuration Page

New page at `/domains` to manage domain configs:
- Create/edit domains
- Set selection rules visually
- Associate Guidelines and Criteria versions
- View domain performance metrics

### 2. Task View Enhancement

Show which domain was used:
```
Task #1234: Send Outreach
Domain: senior-engineering
Guidelines: v3.2 (senior-eng-optimized)
Criteria: v2.1 (high-bar-evaluation)
Score: 0.87
```

### 3. Guidelines/Criteria Page Update

Add domain filter:
- "All Domains" view
- Domain-specific views
- Inheritance visualization

## Example Domain Configurations

### Senior Engineering Roles

```json
{
  "name": "Senior Engineering",
  "slug": "senior-engineering",
  "selectionRules": [
    { "field": "requisition.seniority", "operator": "in", "value": ["senior", "staff", "principal", "lead"] },
    { "field": "requisition.department", "operator": "in", "value": ["engineering", "product", "data"], "logicalOp": "AND" }
  ],
  "configOverrides": {
    "constraints": [
      {
        "id": "quality-over-volume",
        "type": "rate_limit",
        "config": { "maxCount": 20, "windowMinutes": 1440, "perEntity": "requisition" }
      }
    ]
  }
}
```

**Guidelines (G₁) differences:**
- More personalized outreach templates
- Emphasis on technical depth in messaging
- Higher bar for candidate scoring (repos, contributions)
- Longer follow-up sequences

**Criteria (C₁) differences:**
- Stricter technical fit evaluation
- Higher threshold for outreach quality (0.85 vs 0.75)
- Require evidence of leadership/mentorship

### Entry-Level/Volume Hiring

```json
{
  "name": "Entry Level",
  "slug": "entry-level",
  "selectionRules": [
    { "field": "requisition.seniority", "operator": "in", "value": ["entry", "junior", "associate"] }
  ],
  "configOverrides": {
    "constraints": [
      {
        "id": "volume-mode",
        "type": "rate_limit",
        "config": { "maxCount": 100, "windowMinutes": 1440, "perEntity": "requisition" }
      }
    ]
  }
}
```

**Guidelines (G₂) differences:**
- Shorter, more templated outreach
- Focus on potential over experience
- Faster follow-up cadence
- School/bootcamp recognition

**Criteria (C₂) differences:**
- Lower experience requirements
- Higher weight on growth indicators
- Different success metrics (volume, response rate)

### Healthcare Vertical

```json
{
  "name": "Healthcare",
  "slug": "healthcare",
  "selectionRules": [
    { "field": "requisition.industry", "operator": "equals", "value": "healthcare" },
    { "field": "requisition.tags", "operator": "contains", "value": "HIPAA", "logicalOp": "OR" }
  ],
  "configOverrides": {
    "constraints": [
      {
        "id": "hipaa-compliance",
        "type": "compliance",
        "config": { "regulations": ["HIPAA"], "requirements": [...] }
      }
    ]
  }
}
```

**Guidelines (G₃) differences:**
- Compliance-aware messaging
- Credential verification workflows
- Longer vetting process
- Different escalation triggers

**Criteria (C₃) differences:**
- Compliance checklist requirements
- Credential verification standards
- Background check evaluation

## Implementation Phases

### Phase 1: Schema & Data Model
- [ ] Add DomainConfig model to Prisma schema
- [ ] Add domain relations to Guidelines/Criteria
- [ ] Create migration
- [ ] Add DomainRepository

### Phase 2: Domain Selection
- [ ] Implement DomainSelector service
- [ ] Update InnerLoopEngine to use domain selection
- [ ] Add domain context to TaskContext

### Phase 3: Dashboard UI
- [ ] Create /domains management page
- [ ] Update Guidelines/Criteria pages with domain filter
- [ ] Add domain indicator to task views

### Phase 4: Learning Integration
- [ ] Track learnings per domain
- [ ] Implement cross-domain learning propagation
- [ ] Add domain performance analytics

## Benefits

1. **Specialization**: Each domain optimizes for its specific use case
2. **Self-Improvement**: Learnings stay scoped to relevant domains
3. **Scalability**: Add new domains without affecting existing ones
4. **A/B Testing**: Compare domain performance on similar jobs
5. **Generalization**: Pattern scales to any domain taxonomy

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Domain proliferation | Limit domains per tenant, require justification |
| Conflicting learnings | Domain isolation, careful propagation rules |
| Selection rule complexity | Visual rule builder, validation |
| Performance overhead | Cache domain selections, lazy load G/C |

---

*Design created: January 2026*
