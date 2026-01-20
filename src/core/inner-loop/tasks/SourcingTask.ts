/**
 * Sourcing Task - Candidate Search and Discovery
 *
 * Handles:
 * - Search query generation
 * - Candidate ranking
 * - Import recommendations
 */

import {
  BaseTask,
  TaskContext,
  TaskGenerationResult,
  TaskValidationResult,
  TaskLearning,
  ValidationIssue,
  registerTask,
  GeneratedOutput,
} from './BaseTask.js';
import type { ClaudeClient } from '../../../integrations/llm/ClaudeClient.js';
import type { GuidelinesContent } from '../../../domain/entities/Guidelines.js';
import type { CriteriaContent } from '../../../domain/entities/Criteria.js';

// =============================================================================
// TYPES
// =============================================================================

interface SourcingData {
  requisition: {
    title: string;
    description?: string;
    requirements: Array<{
      category: 'must_have' | 'nice_to_have';
      requirement: string;
    }>;
    experienceLevel?: string;
    location?: string;
    remote?: boolean;
    salary?: {
      min?: number;
      max?: number;
      currency?: string;
    };
  };
  searchParams?: {
    platforms?: ('linkedin' | 'indeed' | 'internal_ats')[];
    excludeCompanies?: string[];
    includeCompanies?: string[];
    maxResults?: number;
  };
  existingCandidates?: Array<{
    name: string;
    linkedInUrl?: string;
    email?: string;
  }>;
}

interface SourcingOutput {
  searchQueries: SearchQuery[];
  booleanSearchStrings: BooleanSearch[];
  targetCompanies: string[];
  targetTitles: string[];
  sourcingStrategy: string;
  estimatedPoolSize: string;
  recommendedPlatforms: string[];
}

interface SearchQuery {
  platform: string;
  query: string;
  filters: Record<string, unknown>;
  expectedYield: string;
}

interface BooleanSearch {
  platform: 'linkedin' | 'indeed' | 'generic';
  searchString: string;
  explanation: string;
}

// =============================================================================
// SOURCING TASK
// =============================================================================

export class SourcingTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'SEARCH_CANDIDATES');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as SourcingData;

    // Get sourcing workflow
    const workflow = this.findWorkflow(guidelines, 'candidate_sourcing');

    // Get any sourcing constraints
    const constraints = this.findConstraints(guidelines, 'sourcing');

    // Build the generation prompt
    const systemPrompt = this.buildSystemPrompt(guidelines);
    const userPrompt = this.buildUserPrompt(data);

    // Generate the sourcing strategy
    const response = await this.claude.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.5, // Some creativity for search variations
      maxTokens: 3000,
    });

    const output = this.claude.parseJsonResponse<SourcingOutput>(response);

    return {
      output: {
        type: 'sourcing_strategy',
        content: output,
        format: 'structured',
        taskMetadata: {
          requisitionId: context.requisitionId,
          roleTitle: data.requisition.title,
          platforms: data.searchParams?.platforms || ['linkedin'],
        },
      },
      metadata: {
        queryCount: output.searchQueries.length,
        targetCompanyCount: output.targetCompanies.length,
      },
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as SourcingOutput;
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    // 1. Check for required components
    if (!content.searchQueries || content.searchQueries.length === 0) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'No search queries generated',
      });
      score -= 0.4;
    }

    if (!content.booleanSearchStrings || content.booleanSearchStrings.length === 0) {
      issues.push({
        severity: 'warning',
        dimension: 'completeness',
        message: 'No boolean search strings provided',
      });
      score -= 0.15;
    }

    if (!content.targetCompanies || content.targetCompanies.length === 0) {
      issues.push({
        severity: 'warning',
        dimension: 'strategy',
        message: 'No target companies identified',
      });
      score -= 0.1;
    }

    if (!content.sourcingStrategy) {
      issues.push({
        severity: 'warning',
        dimension: 'completeness',
        message: 'Missing sourcing strategy explanation',
      });
      score -= 0.1;
    }

    // 2. Validate search queries
    for (let i = 0; i < (content.searchQueries?.length || 0); i++) {
      const query = content.searchQueries[i];

      if (!query.query || query.query.trim().length === 0) {
        issues.push({
          severity: 'error',
          dimension: 'quality',
          message: `Search query ${i + 1} is empty`,
        });
        score -= 0.15;
      }

      if (!query.platform) {
        issues.push({
          severity: 'warning',
          dimension: 'completeness',
          message: `Search query ${i + 1} missing platform`,
        });
        score -= 0.05;
      }
    }

    // 3. Validate boolean searches
    for (let i = 0; i < (content.booleanSearchStrings?.length || 0); i++) {
      const boolSearch = content.booleanSearchStrings[i];

      // Check for valid boolean operators
      const hasOperators = /AND|OR|NOT|\(|\)/.test(boolSearch.searchString);
      if (!hasOperators && boolSearch.searchString.split(' ').length > 3) {
        issues.push({
          severity: 'info',
          dimension: 'optimization',
          message: `Boolean search ${i + 1} may benefit from operators`,
        });
      }

      // Check for balanced parentheses
      const openCount = (boolSearch.searchString.match(/\(/g) || []).length;
      const closeCount = (boolSearch.searchString.match(/\)/g) || []).length;
      if (openCount !== closeCount) {
        issues.push({
          severity: 'error',
          dimension: 'syntax',
          message: `Boolean search ${i + 1} has unbalanced parentheses`,
        });
        score -= 0.15;
      }
    }

    // 4. Check for reasonable target counts
    if (content.targetCompanies && content.targetCompanies.length > 50) {
      issues.push({
        severity: 'info',
        dimension: 'scope',
        message: 'Large number of target companies - consider prioritizing',
      });
    }

    if (content.targetTitles && content.targetTitles.length > 20) {
      issues.push({
        severity: 'info',
        dimension: 'scope',
        message: 'Many target titles - search may be too broad',
      });
    }

    return {
      valid: score >= 0.7 && !issues.some((i) => i.severity === 'error'),
      score: Math.max(0, Math.min(1, score)),
      issues,
    };
  }

  async extractLearnings(
    context: TaskContext,
    output: GeneratedOutput,
    validation: TaskValidationResult,
    guidelines: GuidelinesContent
  ): Promise<TaskLearning[]> {
    const learnings: TaskLearning[] = [];
    const content = output.content as SourcingOutput;
    const data = context.data as unknown as SourcingData;

    // Analyze for pattern discoveries
    if (content.targetCompanies && content.targetCompanies.length > 0) {
      learnings.push({
        type: 'pattern_discovered',
        description: `Identified ${content.targetCompanies.length} target companies for ${data.requisition.title} roles`,
      });
    }

    // Check if boolean searches need refinement
    for (const issue of validation.issues) {
      if (issue.dimension === 'syntax') {
        learnings.push({
          type: 'guideline_update',
          description: 'Boolean search syntax guidelines may need updating',
          suggestedUpdate: {
            targetPath: 'workflows.candidate_sourcing.boolean_syntax_rules',
            operation: 'add',
            newValue: {
              requireBalancedParentheses: true,
              validateBeforeExecution: true,
            },
            rationale: 'Syntax errors in generated boolean searches',
          },
        });
      }
    }

    return learnings;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private buildSystemPrompt(guidelines: GuidelinesContent): string {
    return `You are Riley, an AI recruiting assistant generating candidate sourcing strategies.

## Guidelines
- Create targeted, effective search queries
- Generate proper boolean search strings for each platform
- Identify relevant companies to target
- Consider the role requirements when building searches
- Balance breadth vs. specificity

## Boolean Search Syntax
- LinkedIn: Use AND, OR, NOT, parentheses, quotes for exact phrases
- Indeed: Similar syntax with some variations
- Always balance parentheses

## Output Format
Return JSON with this structure:
{
  "searchQueries": [
    {
      "platform": "linkedin|indeed|internal_ats",
      "query": "the search query",
      "filters": { "location": "...", "experienceLevel": "...", etc },
      "expectedYield": "estimated number of results"
    }
  ],
  "booleanSearchStrings": [
    {
      "platform": "linkedin|indeed|generic",
      "searchString": "the full boolean search string",
      "explanation": "what this search targets"
    }
  ],
  "targetCompanies": ["list of companies to target"],
  "targetTitles": ["list of job titles to search"],
  "sourcingStrategy": "explanation of the overall strategy",
  "estimatedPoolSize": "rough estimate of candidate pool",
  "recommendedPlatforms": ["prioritized list of platforms to use"]
}`;
  }

  private buildUserPrompt(data: SourcingData): string {
    const req = data.requisition;

    let prompt = `Create a sourcing strategy for this role:

## Role: ${req.title}
${req.description ? `Description: ${req.description}` : ''}
Experience Level: ${req.experienceLevel || 'Not specified'}
Location: ${req.location || 'Not specified'}
Remote: ${req.remote ? 'Yes' : 'Not specified'}
${req.salary ? `Salary Range: ${req.salary.currency || 'USD'} ${req.salary.min || '?'} - ${req.salary.max || '?'}` : ''}

## Requirements
`;

    for (const requirement of req.requirements) {
      prompt += `- [${requirement.category.toUpperCase()}] ${requirement.requirement}\n`;
    }

    if (data.searchParams) {
      prompt += `\n## Search Parameters\n`;
      if (data.searchParams.platforms) {
        prompt += `Platforms: ${data.searchParams.platforms.join(', ')}\n`;
      }
      if (data.searchParams.excludeCompanies) {
        prompt += `Exclude: ${data.searchParams.excludeCompanies.join(', ')}\n`;
      }
      if (data.searchParams.includeCompanies) {
        prompt += `Prioritize: ${data.searchParams.includeCompanies.join(', ')}\n`;
      }
      if (data.searchParams.maxResults) {
        prompt += `Target: ${data.searchParams.maxResults} candidates\n`;
      }
    }

    if (data.existingCandidates && data.existingCandidates.length > 0) {
      prompt += `\n## Existing Candidates (exclude from search)\n`;
      for (const candidate of data.existingCandidates.slice(0, 10)) {
        prompt += `- ${candidate.name}${candidate.linkedInUrl ? ` (${candidate.linkedInUrl})` : ''}\n`;
      }
    }

    prompt += `\nGenerate comprehensive search queries, boolean strings, and a sourcing strategy.`;

    return prompt;
  }
}

// =============================================================================
// CANDIDATE IMPORT TASK
// =============================================================================

export class CandidateImportTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'IMPORT_CANDIDATE');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as {
      source: string;
      rawData: Record<string, unknown>;
      requisitionId?: string;
    };

    // Parse and normalize candidate data
    const response = await this.claude.chat({
      systemPrompt: `You are Riley, parsing candidate data from various sources.
Extract and normalize candidate information into a structured format.

Return JSON:
{
  "candidate": {
    "firstName": "string",
    "lastName": "string",
    "email": "string or null",
    "phone": "string or null",
    "linkedInUrl": "string or null",
    "currentTitle": "string or null",
    "currentCompany": "string or null",
    "location": "string or null",
    "skills": ["array of skills"],
    "experience": [
      {
        "title": "string",
        "company": "string",
        "duration": "string",
        "description": "string or null"
      }
    ],
    "education": [
      {
        "degree": "string",
        "institution": "string",
        "year": "string or null"
      }
    ]
  },
  "confidence": 0.0-1.0,
  "missingFields": ["list of fields that couldn't be extracted"],
  "source": "source platform"
}`,
      prompt: `Parse this candidate data from ${data.source}:

${JSON.stringify(data.rawData, null, 2)}`,
      temperature: 0.1,
      maxTokens: 2000,
    });

    const output = this.claude.parseJsonResponse(response);

    return {
      output: {
        type: 'candidate_import',
        content: output,
        format: 'structured',
        taskMetadata: {
          source: data.source,
          requisitionId: data.requisitionId,
        },
      },
      metadata: {},
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as {
      candidate: Record<string, unknown>;
      confidence: number;
      missingFields: string[];
    };
    const issues: ValidationIssue[] = [];
    let score = content.confidence || 0.5;

    // Check required fields
    if (!content.candidate?.firstName || !content.candidate?.lastName) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing candidate name',
      });
      score -= 0.3;
    }

    if (!content.candidate?.email && !content.candidate?.linkedInUrl) {
      issues.push({
        severity: 'warning',
        dimension: 'completeness',
        message: 'No contact information extracted',
      });
      score -= 0.2;
    }

    if (content.missingFields && content.missingFields.length > 5) {
      issues.push({
        severity: 'info',
        dimension: 'quality',
        message: `${content.missingFields.length} fields could not be extracted`,
      });
    }

    return {
      valid: score >= 0.5 && !issues.some((i) => i.severity === 'error'),
      score: Math.max(0, Math.min(1, score)),
      issues,
    };
  }

  async extractLearnings(): Promise<TaskLearning[]> {
    return [];
  }
}

// =============================================================================
// REGISTRATION
// =============================================================================

registerTask('SEARCH_CANDIDATES', SourcingTask);
registerTask('IMPORT_CANDIDATE', CandidateImportTask);
