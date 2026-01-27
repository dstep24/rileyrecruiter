/**
 * AI Query Generator
 *
 * Transforms job descriptions into intelligent search strategies using Claude.
 * This solves the problem of simple keyword searches returning unqualified candidates
 * by understanding seniority levels, title variants, and experience signals.
 *
 * Key capabilities:
 * - Seniority level detection and mapping
 * - Title variant generation
 * - Anti-pattern identification (titles to exclude)
 * - Experience signal detection
 * - Skill weighting
 * - Boolean query generation
 */

import { getClaudeClient, ClaudeClient } from '../../integrations/llm/ClaudeClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AIQueryGeneratorInput {
  jobDescription: string;
  title: string;
  location?: string;
  requirements?: string[];
  preferredSkills?: string[];
  companyContext?: string;
  excludeCompanies?: string[];
  /** Notes from hiring manager call - takes precedence over job description when there's a conflict */
  intakeNotes?: string;
  /** If true, this is a fully remote role - skip location filtering */
  isFullyRemote?: boolean;
  /**
   * Search context for intelligent query generation.
   * Free-form context about the hiring situation that helps generate smarter searches.
   * Examples:
   * - "Legacy enterprise company, below-market comp, avoid FAANG candidates"
   * - "Insurance/banking industry, looking for modernization experience"
   * - "Startup culture, need risk-takers with equity experience"
   *
   * This context should influence the search query itself, not just scoring.
   * For example, adding industry terms or transformation keywords to the search.
   */
  searchContext?: string;
}

export interface AISearchStrategy {
  // Core search parameters
  primaryTitles: string[];      // Exact title matches to search
  titleVariants: string[];      // Equivalent/alternative titles
  excludeTitles: string[];      // Titles that indicate wrong level

  // Seniority understanding
  seniorityLevel: SeniorityLevel;
  levelRationale: string;
  minYearsExperience: number;
  minYearsAtLevel: number;

  // Skills analysis
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  skillWeights: Record<string, number>;

  // Experience signals
  leadershipIndicators: string[];
  achievementPatterns: string[];
  redFlags: string[];

  // Search execution
  searchQueries: SearchQuery[];

  // Exclusions
  excludeCompanies: string[];

  // Metadata
  reasoning: string;
  confidence: number;
}

export type SeniorityLevel = 'IC' | 'Lead' | 'Manager' | 'Senior Manager' | 'Director' | 'VP' | 'C-Level';

export interface SearchQuery {
  query: string;
  api: 'classic' | 'sales_navigator' | 'recruiter';
  priority: number;
  rationale: string;
  expectedYield: 'high' | 'medium' | 'low';
  filters?: {
    titles?: string[];
    skills?: string[];
    locations?: string[];
    experience?: string;
  };
}

// =============================================================================
// PROMPTS
// =============================================================================

const QUERY_GENERATION_SYSTEM_PROMPT = `You are an expert technical recruiter creating optimal LinkedIn search strategies.

Your job is to analyze a job description and create a comprehensive search strategy that will find qualified candidates while filtering out unqualified ones.

CRITICAL: SEARCH CONTEXT INTELLIGENCE
When a search context is provided, it contains crucial intelligence that MUST influence your search queries.

YOU MUST EXPAND AND INFER beyond the literal context. Use your expert knowledge to derive related signals:

1. **Industry Context** → EXPAND to related industries with similar characteristics
   - "insurance/banking" → Also include: healthcare, financial services, credit union, mortgage, pension, actuarial, regulated, compliance, government
   - "legacy enterprise" → Also include: Fortune 500, enterprise, corporate, established, traditional
   - "fintech startup" → Also include: neobank, payments, crypto, DeFi, Series A/B/C

2. **Technology Stack Signals** → INFER the ecosystem
   - ".NET legacy stack" → Also: C#, SQL Server, Windows, Azure, SSIS, SSRS, Entity Framework
   - "modernizing legacy" → Also: migration, refactoring, microservices, cloud-native, containerization, technical debt
   - "mainframe" → Also: COBOL, DB2, AS/400, legacy systems, modernization, replatforming

3. **Company Type Pattern Recognition** → DERIVE similar company types
   - "Legacy enterprise" companies share patterns: long-tenured employees, regulated industries, risk-averse culture
   - Look for candidates from: insurance carriers, regional banks, healthcare payers, utilities, telecom, manufacturing
   - These candidates understand: change management, stakeholder buy-in, compliance, waterfall-to-agile transformation

4. **Compensation Reality** → AUTO-EXCLUDE high-comp companies when context suggests below-market
   - "Below-market comp" or specific salary ranges < $200K → Add to excludeCompanies: Google, Meta, Netflix, Apple, Amazon, Microsoft, Stripe, Uber, Airbnb, Coinbase, etc.
   - Candidates from these companies typically won't accept 40-60% pay cuts

5. **Transformation Expertise** → When modernization is mentioned, ADD transformation keywords
   - "modernize old legacy tech" → Include: modernization, migration, transformation, replatforming, cloud migration, legacy, technical debt, refactoring
   - These are HIGHLY valuable signals - someone who's done this before at a similar company is gold

IMPORTANT: BE CREATIVE with industry expansion. Your job is to think like an expert recruiter who knows:
- Which industries have similar tech debt problems
- Which company types share cultural DNA
- What keywords successful candidates from these backgrounds would have on their profiles

Example: Context says "insurance, banking, legacy .NET"
Your queries should include: (insurance OR banking OR "financial services" OR healthcare OR "credit union" OR enterprise) AND (modernization OR migration OR ".NET" OR "legacy systems" OR transformation)

CRITICAL SENIORITY MAPPING:
- IC (Individual Contributor): Engineer, Developer, Designer, Analyst - does technical work
- Lead: Tech Lead, Team Lead, Principal - small team guidance, still hands-on
- Manager: Engineering Manager, Product Manager - manages people (typically 5-15)
- Senior Manager: Senior Manager, Group Manager - manages managers or large teams
- Director: Director, Head of - owns a function, multiple teams (typically 20-50)
- VP: Vice President - executive, multiple functions, organizational strategy
- C-Level: CTO, CEO, CPO - company-wide responsibility

TITLE VARIANT EXAMPLES:
- "Director of Engineering" variants: VP Engineering, Head of Engineering, Engineering Director, Director of Software Engineering
- "Senior Software Engineer" variants: Staff Engineer, Software Engineer III, Software Engineer IV, Senior Developer

ANTI-PATTERN EXAMPLES (titles to EXCLUDE):
- For Director role: Senior Engineer, Staff Engineer, Principal Engineer (IC roles)
- For Manager role: Tech Lead (unless clear people management), Individual Contributor titles
- For VP role: Director (unless stepping up), Manager titles

EXPERIENCE SIGNAL EXAMPLES:
- Leadership: "Led team of", "Managed", "Built and scaled", "Grew team from X to Y"
- Achievement: "Launched", "Delivered", "Increased revenue by", "Reduced costs by"
- Scale: "100+ engineers", "B+ users", "Fortune 500", "Series B+"

RED FLAG EXAMPLES:
- "Intern" or "Internship" in recent roles
- "Junior" or "Entry-level" in current title
- Only IC experience for leadership roles
- No progression over many years

BOOLEAN SEARCH BEST PRACTICES:
When generating search queries, use proper Boolean syntax:
- Quote multi-word phrases: "Director of Engineering" (not Director of Engineering)
- Use OR to combine alternatives: "Director" OR "Head of" OR "VP"
- Use AND to require multiple criteria: ("Director of Engineering") AND (TypeScript OR React)
- Use NOT to exclude: NOT ("Sales" OR "Marketing")
- Use parentheses to group: (title terms) AND (skill terms) NOT (exclusions)
- Prioritize title matching over skills (titles are more reliable on LinkedIn)
- Keep Classic API queries under 150 chars, Sales Navigator under 500 chars

Output valid JSON only - no markdown, no explanation outside the JSON.`;

function buildQueryGenerationPrompt(input: AIQueryGeneratorInput): string {
  // Build the intake notes section if provided
  const intakeNotesSection = input.intakeNotes ? `
### 🔥 INTAKE NOTES FROM HIRING MANAGER (HIGHEST PRIORITY)
These notes come from a live conversation with the hiring manager and OVERRIDE the job description when there's a conflict. Treat these as the ground truth:

${input.intakeNotes}

---
` : '';

  // Build search context section if provided - influences query generation
  const searchContextSection = input.searchContext ? `
### 🧠 SEARCH CONTEXT (MUST INFLUENCE YOUR QUERIES)
The recruiter has provided strategic context about this hiring situation. Use this to generate SMARTER QUERIES:

${input.searchContext}

**How to apply this context to your search queries:**
- If industries are mentioned (insurance, banking, fintech), ADD those industry terms to your Boolean queries
- If modernization/transformation is mentioned, ADD keywords like "modernization", "migration", "legacy"
- If specific company types are preferred (enterprise, startup), ADD those terms to queries
- If companies should be avoided (FAANG for below-market roles), ADD them to excludeCompanies
- Think about what keywords someone at the RIGHT type of company would have on their profile

---
` : '';

  // Build the remote work indicator
  const remoteIndicator = input.isFullyRemote
    ? '\n**🌍 FULLY REMOTE ROLE** - Location is not a factor. Search for the best candidates regardless of where they are located.\n'
    : '';

  return `Analyze this job and create an optimal LinkedIn search strategy.

## Job Details
Title: ${input.title}
Location: ${input.isFullyRemote ? 'FULLY REMOTE (location not a factor)' : (input.location || 'Not specified')}
${remoteIndicator}
${intakeNotesSection}${searchContextSection}
### Job Description
${input.jobDescription}

### Requirements
${input.requirements?.join('\n') || 'Not specified'}

### Preferred Skills
${input.preferredSkills?.join(', ') || 'Not specified'}

### Company Context
${input.companyContext || 'Not specified'}

### Companies to Exclude
${input.excludeCompanies?.join(', ') || 'None'}

## Your Task

Create a comprehensive search strategy:

1. **Determine Seniority Level**
   - What level is this role? (IC, Lead, Manager, Senior Manager, Director, VP, C-Level)
   - What evidence from the JD supports this?
   - How many years of experience minimum?
   - How many years at this seniority level minimum?

2. **Generate Title Variants**
   - What's the primary title to search?
   - What equivalent titles might qualified candidates have?
   - What titles should we EXCLUDE to avoid unqualified candidates?

3. **Analyze Skills**
   - Which skills are absolutely required (1.0 weight)?
   - Which are strongly preferred (0.7 weight)?
   - Which are nice-to-have (0.4 weight)?

4. **Identify Experience Signals**
   - What phrases indicate the right seniority? (leadership indicators)
   - What achievements should we look for? (achievement patterns)
   - What are red flags to filter out?

5. **Create Search Queries for THREE API Types**
   Generate exactly 3 search queries, one for each LinkedIn API type:

   a) **Classic API** (priority 1, ~200 char limit):
      - Shortest query, focus on primary titles + top 3-4 must-have skills
      - Format: ("Title1" OR "Title2") AND (Skill1 OR Skill2 OR Skill3)

   b) **Recruiter API** (priority 2, ~1000 char limit):
      - Longest query, include ALL title variants + ALL skills + exclusions
      - Format: ("Title1" OR "Title2" OR ... all variants) AND (Skill1 OR Skill2 OR ... all skills) NOT (Exclusion1 OR Exclusion2)

   c) **Sales Navigator API** (priority 3, ~500 char limit):
      - Medium query, include more titles + all must-have skills
      - Format: ("Title1" OR "Title2" OR "Title3") AND (Skill1 OR Skill2 OR Skill3 OR Skill4 OR Skill5)

## Output Format (JSON only)

{
  "primaryTitles": ["<main title>", "<close variant>"],
  "titleVariants": ["<alternative 1>", "<alternative 2>", "..."],
  "excludeTitles": ["<exclude 1>", "<exclude 2>", "..."],
  "seniorityLevel": "<IC|Lead|Manager|Senior Manager|Director|VP|C-Level>",
  "levelRationale": "<why this level>",
  "minYearsExperience": <number>,
  "minYearsAtLevel": <number>,
  "mustHaveSkills": ["<skill>", "..."],
  "niceToHaveSkills": ["<skill>", "..."],
  "skillWeights": {
    "<skill>": <0.4-1.0>,
    "...": "..."
  },
  "leadershipIndicators": ["<phrase to look for>", "..."],
  "achievementPatterns": ["<pattern>", "..."],
  "redFlags": ["<red flag>", "..."],
  "searchQueries": [
    {
      "query": "<LinkedIn Boolean search - SHORTER, ~200 chars max, prioritize titles + top 3-4 skills>",
      "api": "classic",
      "priority": 1,
      "rationale": "<why this query for Classic API>",
      "expectedYield": "high",
      "filters": {
        "titles": ["<title>"],
        "skills": ["<skill>"],
        "locations": ["<location>"],
        "experience": "<5+ years>"
      }
    },
    {
      "query": "<LinkedIn Boolean search - LONGEST, ~1000 chars max, include all titles + all skills + exclusions>",
      "api": "recruiter",
      "priority": 2,
      "rationale": "<why this expanded query for Recruiter API>",
      "expectedYield": "high",
      "filters": {
        "titles": ["<all title variants>"],
        "skills": ["<all must-have + nice-to-have skills>"],
        "locations": ["<location>"],
        "experience": "<5+ years>"
      }
    },
    {
      "query": "<LinkedIn Boolean search - MEDIUM, ~500 chars max, include more titles + more skills>",
      "api": "sales_navigator",
      "priority": 3,
      "rationale": "<why this query for Sales Navigator API>",
      "expectedYield": "high",
      "filters": {
        "titles": ["<more title variants>"],
        "skills": ["<must-have skills>"],
        "locations": ["<location>"],
        "experience": "<5+ years>"
      }
    }
  ],
  "excludeCompanies": ["<company>", "..."],
  "reasoning": "<overall strategy explanation>",
  "confidence": <0.0-1.0>
}`;
}

// =============================================================================
// AI QUERY GENERATOR CLASS
// =============================================================================

export class AIQueryGenerator {
  private claudeClient: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient || getClaudeClient();
  }

  /**
   * Generate an intelligent search strategy from a job description
   */
  async generateSearchStrategy(input: AIQueryGeneratorInput): Promise<AISearchStrategy> {
    const prompt = buildQueryGenerationPrompt(input);

    const response = await this.claudeClient.chat({
      systemPrompt: QUERY_GENERATION_SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
      maxTokens: 4096,
    });

    const parsed = this.claudeClient.parseJsonResponse<AISearchStrategy>(response);

    // Validate and ensure required fields
    return {
      primaryTitles: parsed.primaryTitles || [input.title],
      titleVariants: parsed.titleVariants || [],
      excludeTitles: parsed.excludeTitles || [],
      seniorityLevel: parsed.seniorityLevel || this.inferSeniorityFromTitle(input.title),
      levelRationale: parsed.levelRationale || '',
      minYearsExperience: parsed.minYearsExperience || 5,
      minYearsAtLevel: parsed.minYearsAtLevel || 2,
      mustHaveSkills: parsed.mustHaveSkills || input.requirements || [],
      niceToHaveSkills: parsed.niceToHaveSkills || input.preferredSkills || [],
      skillWeights: parsed.skillWeights || {},
      leadershipIndicators: parsed.leadershipIndicators || [],
      achievementPatterns: parsed.achievementPatterns || [],
      redFlags: parsed.redFlags || [],
      searchQueries: parsed.searchQueries || this.generateDefaultQueries(input),
      excludeCompanies: parsed.excludeCompanies || input.excludeCompanies || [],
      reasoning: parsed.reasoning || '',
      confidence: parsed.confidence || 0.7,
    };
  }

  /**
   * Quickly infer seniority from title without AI call
   */
  inferSeniorityFromTitle(title: string): SeniorityLevel {
    const titleLower = title.toLowerCase();

    if (/\b(cto|ceo|cfo|coo|chief)\b/.test(titleLower)) return 'C-Level';
    if (/\b(vp|vice president)\b/.test(titleLower)) return 'VP';
    if (/\bdirector\b/.test(titleLower) || /\bhead of\b/.test(titleLower)) return 'Director';
    if (/\bsenior manager\b/.test(titleLower)) return 'Senior Manager';
    if (/\bmanager\b/.test(titleLower)) return 'Manager';
    if (/\b(lead|principal|staff)\b/.test(titleLower)) return 'Lead';
    return 'IC';
  }

  /**
   * Generate default search queries when AI doesn't return them
   */
  private generateDefaultQueries(input: AIQueryGeneratorInput): SearchQuery[] {
    return [
      {
        query: input.title,
        api: 'classic',
        priority: 1,
        rationale: 'Exact title match',
        expectedYield: 'high',
        filters: {
          titles: [input.title],
          locations: input.location ? [input.location] : undefined,
        },
      },
    ];
  }

  /**
   * Convert search strategy to Unipile search parameters
   */
  strategyToUnipileParams(
    strategy: AISearchStrategy,
    options: { location?: string; cursor?: string } = {}
  ): UnipileSearchParams {
    // Build keywords from primary titles
    const keywords = strategy.primaryTitles.join(' OR ');

    return {
      api: 'classic',
      category: 'people',
      keywords,
      skills: strategy.mustHaveSkills.slice(0, 10), // Unipile limit
      role: strategy.primaryTitles.slice(0, 5),
      location: options.location ? [options.location] : undefined,
      cursor: options.cursor,
    };
  }

  /**
   * Check if a candidate title matches the strategy (for filtering)
   */
  titleMatchesStrategy(candidateTitle: string, strategy: AISearchStrategy): boolean {
    const titleLower = candidateTitle.toLowerCase();

    // Check for excluded titles first
    for (const excludeTitle of strategy.excludeTitles) {
      if (titleLower.includes(excludeTitle.toLowerCase())) {
        return false;
      }
    }

    // Check for matching titles
    const allTargetTitles = [...strategy.primaryTitles, ...strategy.titleVariants];
    for (const targetTitle of allTargetTitles) {
      if (titleLower.includes(targetTitle.toLowerCase()) ||
          targetTitle.toLowerCase().includes(titleLower)) {
        return true;
      }
    }

    // If no match found, allow through but with caution
    return true; // Let the scorer handle it
  }

  /**
   * Calculate skill match score for a candidate
   */
  calculateSkillMatchScore(candidateSkills: string[], strategy: AISearchStrategy): number {
    if (candidateSkills.length === 0) return 0;

    const candidateSkillsLower = candidateSkills.map(s => s.toLowerCase());
    let totalWeight = 0;
    let matchedWeight = 0;

    // Check must-have skills
    for (const skill of strategy.mustHaveSkills) {
      const weight = strategy.skillWeights[skill] || 1.0;
      totalWeight += weight;
      if (candidateSkillsLower.some(cs =>
        cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)
      )) {
        matchedWeight += weight;
      }
    }

    // Check nice-to-have skills
    for (const skill of strategy.niceToHaveSkills) {
      const weight = strategy.skillWeights[skill] || 0.4;
      totalWeight += weight;
      if (candidateSkillsLower.some(cs =>
        cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs)
      )) {
        matchedWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 50;
  }

  /**
   * Check candidate experience for red flags
   */
  hasRedFlags(
    candidateTitle: string,
    experienceSummary: string,
    strategy: AISearchStrategy
  ): { hasFlags: boolean; flags: string[] } {
    const foundFlags: string[] = [];
    const textToCheck = `${candidateTitle} ${experienceSummary}`.toLowerCase();

    for (const redFlag of strategy.redFlags) {
      if (textToCheck.includes(redFlag.toLowerCase())) {
        foundFlags.push(redFlag);
      }
    }

    return {
      hasFlags: foundFlags.length > 0,
      flags: foundFlags,
    };
  }

  /**
   * Check for positive experience signals
   */
  findPositiveSignals(
    experienceSummary: string,
    strategy: AISearchStrategy
  ): { leadershipSignals: string[]; achievementSignals: string[] } {
    const textLower = experienceSummary.toLowerCase();

    const leadershipSignals = strategy.leadershipIndicators.filter(indicator =>
      textLower.includes(indicator.toLowerCase())
    );

    const achievementSignals = strategy.achievementPatterns.filter(pattern =>
      textLower.includes(pattern.toLowerCase())
    );

    return { leadershipSignals, achievementSignals };
  }
}

// =============================================================================
// TYPES FOR UNIPILE INTEGRATION
// =============================================================================

interface UnipileSearchParams {
  api: 'classic' | 'sales_navigator' | 'recruiter';
  category: 'people' | 'companies' | 'jobs';
  keywords?: string;
  location?: string[];
  skills?: string[];
  role?: string[];
  cursor?: string;
}

// =============================================================================
// FACTORY
// =============================================================================

let generatorInstance: AIQueryGenerator | null = null;

export function getAIQueryGenerator(): AIQueryGenerator {
  if (!generatorInstance) {
    generatorInstance = new AIQueryGenerator();
  }
  return generatorInstance;
}

export function resetAIQueryGenerator(): void {
  generatorInstance = null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a boolean search query string from strategy
 *
 * This creates a properly formatted Boolean query following LinkedIn's syntax:
 * - Titles in quotes for exact phrase matching
 * - Skills grouped with OR
 * - Exclusions with NOT operator (not just -prefix)
 * - Proper parentheses grouping
 *
 * IMPORTANT: Must-have skills are CRITICAL for finding qualified candidates.
 * A title-only search returns people with the right job title but wrong tech stack.
 */
export function buildBooleanQuery(strategy: AISearchStrategy, options: {
  maxLength?: number;
  includeSkills?: boolean;
  includeExclusions?: boolean;
  maxTitles?: number;
  maxSkills?: number;
} = {}): string {
  const {
    maxLength = 500,
    includeSkills = true,
    includeExclusions = true,
    maxTitles = 10,
    maxSkills = 8,
  } = options;

  const parts: string[] = [];

  // 1. TITLES: Primary + variants (limit based on options)
  const allTitles = [...strategy.primaryTitles, ...strategy.titleVariants].slice(0, maxTitles);
  if (allTitles.length > 0) {
    const titleParts = allTitles.map(title => {
      // Quote multi-word titles, leave single words unquoted
      if (title.includes(' ')) {
        return `"${title}"`;
      }
      return title;
    });
    parts.push(`(${titleParts.join(' OR ')})`);
  }

  // 2. SKILLS: Must-have skills are CRITICAL - always include if available
  if (includeSkills && strategy.mustHaveSkills.length > 0) {
    // Prioritize by weight and limit
    const weightedSkills = strategy.mustHaveSkills
      .map(skill => ({ skill, weight: strategy.skillWeights[skill] || 1.0 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxSkills);

    const skillParts = weightedSkills.map(({ skill }) => {
      // Quote skills with spaces
      if (skill.includes(' ')) {
        return `"${skill}"`;
      }
      return skill;
    });
    parts.push(`(${skillParts.join(' OR ')})`);
  }

  // 3. EXCLUSIONS: Titles to exclude (if enabled)
  if (includeExclusions && strategy.excludeTitles.length > 0) {
    const excludeParts = strategy.excludeTitles.slice(0, 6).map(title => {
      if (title.includes(' ')) {
        return `"${title}"`;
      }
      return title;
    });
    parts.push(`NOT (${excludeParts.join(' OR ')})`);
  }

  // Combine with AND
  let query = parts.join(' AND ');

  // Truncate if needed - but NEVER remove skills before reducing titles
  if (query.length > maxLength) {
    // First: Try removing exclusions
    if (includeExclusions) {
      return buildBooleanQuery(strategy, { maxLength, includeSkills, includeExclusions: false, maxTitles, maxSkills });
    }
    // Second: Reduce title count (keep skills!)
    if (maxTitles > 2) {
      return buildBooleanQuery(strategy, { maxLength, includeSkills, includeExclusions: false, maxTitles: Math.max(2, maxTitles - 2), maxSkills });
    }
    // Third: Reduce skills count
    if (maxSkills > 3) {
      return buildBooleanQuery(strategy, { maxLength, includeSkills, includeExclusions: false, maxTitles: 2, maxSkills: maxSkills - 2 });
    }
    // Last resort: hard truncate at word boundary
    query = query.substring(0, maxLength).replace(/\s+\S*$/, '').trim();
    // Ensure balanced parentheses
    const openCount = (query.match(/\(/g) || []).length;
    const closeCount = (query.match(/\)/g) || []).length;
    if (openCount > closeCount) {
      query += ')'.repeat(openCount - closeCount);
    }
  }

  return query;
}

/**
 * Build a Boolean query optimized for a specific LinkedIn API
 * Each API has different length limits and capabilities
 *
 * CRITICAL: Must-have skills should ALWAYS be included in the search.
 * A title-only query returns candidates with the right job title but wrong tech stack,
 * leading to low AI scores and wasted time reviewing unqualified candidates.
 */
export function buildBooleanQueryForApi(
  strategy: AISearchStrategy,
  api: 'classic' | 'sales_navigator' | 'recruiter'
): string {
  const limits: Record<string, number> = {
    classic: 200,        // LinkedIn Classic actually supports ~200 chars
    sales_navigator: 500,
    recruiter: 1000,
  };

  const maxLength = limits[api] || 200;

  // Classic API: Limited space, so be strategic
  // ALWAYS include skills - they're more important than having many title variants
  if (api === 'classic') {
    return buildBooleanQuery(strategy, {
      maxLength,
      includeSkills: true,     // ALWAYS include must-have skills
      includeExclusions: false, // Classic doesn't handle NOT well
      maxTitles: 3,            // Limit titles to make room for skills
      maxSkills: 4,            // Top 4 must-have skills
    });
  }

  // Sales Navigator: More room, include everything
  if (api === 'sales_navigator') {
    return buildBooleanQuery(strategy, {
      maxLength,
      includeSkills: true,
      includeExclusions: true,
      maxTitles: 6,
      maxSkills: 6,
    });
  }

  // Recruiter: Full capacity
  return buildBooleanQuery(strategy, {
    maxLength,
    includeSkills: true,
    includeExclusions: true,
    maxTitles: 10,
    maxSkills: 8,
  });
}

/**
 * Get minimum years of experience for a seniority level
 */
export function getMinYearsForLevel(level: SeniorityLevel): number {
  switch (level) {
    case 'C-Level': return 15;
    case 'VP': return 12;
    case 'Director': return 10;
    case 'Senior Manager': return 8;
    case 'Manager': return 5;
    case 'Lead': return 5;
    case 'IC': return 2;
    default: return 3;
  }
}

/**
 * Estimate years of experience from duration strings
 */
export function calculateTotalYears(experiences: Array<{ duration: string }>): number {
  let totalMonths = 0;

  for (const exp of experiences) {
    const duration = exp.duration || '';
    const yearMatch = duration.match(/(\d+)\s*(?:year|yr)/i);
    const monthMatch = duration.match(/(\d+)\s*(?:month|mo)/i);

    if (yearMatch) totalMonths += parseInt(yearMatch[1]) * 12;
    if (monthMatch) totalMonths += parseInt(monthMatch[1]);
  }

  return Math.round(totalMonths / 12);
}
