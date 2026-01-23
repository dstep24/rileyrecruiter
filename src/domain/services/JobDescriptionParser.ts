/**
 * Job Description Parser - Extract Search Criteria from JD
 *
 * Uses Claude to analyze job descriptions and extract structured
 * search criteria for LinkedIn sourcing.
 *
 * Extracts:
 * - Target titles and seniority levels
 * - Required and preferred skills
 * - Experience requirements
 * - Location preferences
 * - Industry context
 * - Boolean search queries
 */

import { getClaudeClient, ClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { UnipileSearchApi } from '../../integrations/linkedin/UnipileClient.js';

// =============================================================================
// SKILL TAXONOMY TYPES - The hierarchical skill extraction system
// =============================================================================

/**
 * Skill category classification for semantic grouping
 */
export type SkillCategory =
  | 'language'      // Programming languages: Python, Go, TypeScript
  | 'framework'     // Frameworks: React, Django, Spring
  | 'database'      // Databases: PostgreSQL, MongoDB, Redis
  | 'cloud'         // Cloud platforms: AWS, GCP, Azure
  | 'tool'          // Tools: Docker, Kubernetes, Terraform
  | 'architecture'  // Patterns: microservices, event-driven, distributed
  | 'domain'        // Domain knowledge: fintech, healthcare, ML
  | 'process';      // Methodologies: Agile, CI/CD, TDD

/**
 * Role domain classification
 */
export type RoleDomain =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'mobile'
  | 'devops'
  | 'platform'
  | 'data'
  | 'ml'
  | 'security'
  | 'infra';

/**
 * Seniority level classification
 */
export type SeniorityLevel =
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'lead'
  | 'manager'
  | 'director'
  | 'vp'
  | 'executive';

/**
 * A single skill with its criticality weight and metadata
 */
export interface WeightedSkill {
  skill: string;
  weight: number;              // 0.0-1.0, where 1.0 = absolutely critical
  category: SkillCategory;
  evidence: string[];          // Why we think this is important
  synonyms: string[];          // Alternate names (React → ReactJS, React.js)
}

/**
 * The core competency - the single most important skill for the role
 */
export interface CoreCompetency {
  skill: string;
  confidence: number;          // 0-1, how certain are we this is THE core skill
  evidence: string[];          // Why we think this (title match, frequency, explicit)
  synonyms: string[];          // Alternate names
  minYearsExpected: number;    // Inferred from JD context
}

/**
 * Role type classification with management and contract indicators
 */
export interface RoleClassification {
  domain: RoleDomain;
  level: SeniorityLevel;
  isManagement: boolean;
  isContractor: boolean;
}

/**
 * Experience requirements synthesized from JD
 */
export interface ExperienceProfile {
  totalYearsMin: number;
  totalYearsMax: number;
  yearsInPrimarySkill: number;
  leadershipYears?: number;
  scaleIndicators: string[];   // "millions of users", "distributed systems"
}

/**
 * The complete skill taxonomy extracted from a job description.
 *
 * This represents a hierarchical understanding of skills where:
 * - P0 (Core): The single most critical skill - day-1 blocker if missing
 * - P1 (Critical): Must-haves - candidate is unqualified without these
 * - P2 (Required): Needed within first month - will use daily
 * - P3 (Preferred): Nice-to-have - accelerates onboarding
 * - P4 (Adjacent): Shows breadth but not decisive
 *
 * CRITICAL: This taxonomy must flow consistently through:
 * 1. Search query generation (use criticalSkills in Boolean queries)
 * 2. GitHub keyword generation (use core + critical for keywords)
 * 3. Candidate scoring (ONLY score against what was searched for)
 */
export interface ExtractedSkillTaxonomy {
  // P0: The single most important technology
  coreCompetency: CoreCompetency;

  // P1: Must-haves - candidate is unqualified without these (weight 0.8-1.0)
  criticalSkills: WeightedSkill[];

  // P2: Required - needed within first month (weight 0.6-0.8)
  requiredSkills: WeightedSkill[];

  // P3: Preferred - accelerates onboarding (weight 0.3-0.6)
  preferredSkills: Array<{
    skill: string;
    weight: number;
    category: SkillCategory;
  }>;

  // P4: Adjacent - shows breadth but not decisive (weight 0.1-0.3)
  adjacentSkills: string[];

  // Role classification for heuristic tuning
  roleType: RoleClassification;

  // Experience synthesis
  experienceProfile: ExperienceProfile;

  // Metadata
  extractionConfidence: number;
  extractionMethod: 'ai' | 'heuristic' | 'hybrid';
  warnings: string[];          // Edge cases detected
}

/**
 * Structural signals extracted without LLM (Pass 1)
 */
export interface StructuralSignals {
  titleKeywords: string[];           // Tech from job title
  sections: {
    requirements: string[];
    preferred: string[];
    responsibilities: string[];
  };
  techFrequency: Record<string, number>;  // How often each tech appears
  emphasisPatterns: Array<{
    skill: string;
    pattern: string;              // e.g., "expert in", "deep experience"
  }>;
  experienceMentions: Array<{
    skill: string;
    years: number;
  }>;
}

// =============================================================================
// TYPES - LEGACY (ParsedJobCriteria for backward compatibility)
// =============================================================================

export interface ParsedJobCriteria {
  // Core search terms
  titles: string[];
  alternativeTitles: string[];
  keywords: string[];

  // Skills
  requiredSkills: string[];
  preferredSkills: string[];
  technicalKeywords: string[];

  // Experience
  experienceYears: {
    min: number;
    max: number;
  };
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';

  // Location
  locations: string[];
  remoteOk: boolean;

  // Industry context
  industries: string[];
  targetCompanies: string[];
  excludeCompanies: string[];

  // Search strategy
  booleanQuery: string;
  searchKeywords: string;
  recommendedApi: UnipileSearchApi;

  // Metadata
  confidence: number;
  notes: string[];
}

export interface JobDescriptionInput {
  title: string;
  description: string;
  requirements?: string[];
  preferredSkills?: string[];
  location?: string;
  remoteType?: 'onsite' | 'remote' | 'hybrid';
  salaryRange?: { min?: number; max?: number; currency?: string };
  companyName?: string;
  industry?: string;
}

// =============================================================================
// JOB DESCRIPTION PARSER
// =============================================================================

export class JobDescriptionParser {
  /**
   * Parse a job description and extract search criteria
   */
  async parse(input: JobDescriptionInput): Promise<ParsedJobCriteria> {
    const claude = getClaudeClient();

    const prompt = this.buildParsingPrompt(input);

    const response = await claude.chat({
      prompt,
      maxTokens: 2000,
    });

    // Extract JSON from response
    const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const parsed = JSON.parse(jsonMatch[1]) as ParsedJobCriteria;

    // Post-process and validate
    return this.postProcess(parsed, input);
  }

  /**
   * Generate a boolean search query from job description
   */
  async generateBooleanQuery(input: JobDescriptionInput): Promise<string> {
    const criteria = await this.parse(input);
    return criteria.booleanQuery;
  }

  /**
   * Quick extraction of just keywords (for simpler use cases)
   */
  async extractKeywords(input: JobDescriptionInput): Promise<string[]> {
    const criteria = await this.parse(input);
    return [
      ...criteria.titles,
      ...criteria.requiredSkills.slice(0, 5),
      ...criteria.technicalKeywords.slice(0, 3),
    ];
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private buildParsingPrompt(input: JobDescriptionInput): string {
    return `You are an expert technical recruiter analyzing a job description to create optimal LinkedIn search criteria.

## Job Information

**Title:** ${input.title}

**Description:**
${input.description}

${input.requirements?.length ? `**Requirements:**\n${input.requirements.map((r) => `- ${r}`).join('\n')}` : ''}

${input.preferredSkills?.length ? `**Preferred Skills:**\n${input.preferredSkills.map((s) => `- ${s}`).join('\n')}` : ''}

${input.location ? `**Location:** ${input.location}` : ''}
${input.remoteType ? `**Remote Type:** ${input.remoteType}` : ''}
${input.companyName ? `**Company:** ${input.companyName}` : ''}
${input.industry ? `**Industry:** ${input.industry}` : ''}

## Your Task

Analyze this job description and extract structured search criteria for LinkedIn sourcing.

Consider:
1. What job titles would candidates have? Include variations and related titles.
2. What are the must-have vs nice-to-have skills?
3. What experience level is appropriate?
4. What companies might have similar roles?
5. What Boolean search query would find the best candidates?

For the Boolean query:
- Use AND for required terms
- Use OR for alternatives (group with parentheses)
- Use NOT to exclude irrelevant results
- Use quotes for exact phrases
- Example: ("Software Engineer" OR "Backend Developer") AND (Python OR Java) AND NOT recruiter

For recommendedApi:
- "classic" for standard LinkedIn search
- "sales_navigator" for more advanced filters and larger talent pool
- "recruiter" if Recruiter Lite or Recruiter access is available

## Output Format

Return your analysis as JSON:

\`\`\`json
{
  "titles": ["Primary Job Title", "Alternative Title 1", "Alternative Title 2"],
  "alternativeTitles": ["Related but less common titles"],
  "keywords": ["key", "search", "terms"],
  "requiredSkills": ["Must-have skill 1", "Must-have skill 2"],
  "preferredSkills": ["Nice-to-have skill 1", "Nice-to-have skill 2"],
  "technicalKeywords": ["tech stack", "frameworks", "tools"],
  "experienceYears": {"min": 3, "max": 7},
  "seniorityLevel": "senior",
  "locations": ["City, State", "Region"],
  "remoteOk": true,
  "industries": ["Industry 1", "Industry 2"],
  "targetCompanies": ["Company that might have this talent"],
  "excludeCompanies": ["${input.companyName || 'Current company to exclude'}"],
  "booleanQuery": "(\"Job Title\" OR \"Alt Title\") AND (Skill1 OR Skill2) AND NOT recruiter",
  "searchKeywords": "Job Title Skill1 Skill2 Location",
  "recommendedApi": "sales_navigator",
  "confidence": 0.85,
  "notes": ["Any special considerations", "Search strategy recommendations"]
}
\`\`\``;
  }

  private postProcess(parsed: ParsedJobCriteria, input: JobDescriptionInput): ParsedJobCriteria {
    // Ensure arrays are present
    parsed.titles = parsed.titles || [input.title];
    parsed.alternativeTitles = parsed.alternativeTitles || [];
    parsed.keywords = parsed.keywords || [];
    parsed.requiredSkills = parsed.requiredSkills || [];
    parsed.preferredSkills = parsed.preferredSkills || [];
    parsed.technicalKeywords = parsed.technicalKeywords || [];
    parsed.locations = parsed.locations || (input.location ? [input.location] : []);
    parsed.industries = parsed.industries || [];
    parsed.targetCompanies = parsed.targetCompanies || [];
    parsed.excludeCompanies = parsed.excludeCompanies || [];
    parsed.notes = parsed.notes || [];

    // Set defaults for missing fields
    if (!parsed.experienceYears) {
      parsed.experienceYears = { min: 0, max: 20 };
    }

    if (!parsed.seniorityLevel) {
      parsed.seniorityLevel = this.inferSeniority(input.title);
    }

    if (parsed.remoteOk === undefined) {
      parsed.remoteOk = input.remoteType === 'remote' || input.remoteType === 'hybrid';
    }

    if (!parsed.recommendedApi) {
      parsed.recommendedApi = 'sales_navigator';
    }

    if (!parsed.confidence) {
      parsed.confidence = 0.8;
    }

    // Generate boolean query if missing
    if (!parsed.booleanQuery) {
      parsed.booleanQuery = this.generateDefaultBooleanQuery(parsed);
    }

    // Generate search keywords if missing
    if (!parsed.searchKeywords) {
      parsed.searchKeywords = [
        ...parsed.titles.slice(0, 2),
        ...parsed.requiredSkills.slice(0, 3),
      ].join(' ');
    }

    // Add current company to exclusions if provided
    if (input.companyName && !parsed.excludeCompanies.includes(input.companyName)) {
      parsed.excludeCompanies.push(input.companyName);
    }

    return parsed;
  }

  private inferSeniority(title: string): ParsedJobCriteria['seniorityLevel'] {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('chief') || lowerTitle.includes('vp') ||
        lowerTitle.includes('vice president') || lowerTitle.includes('director')) {
      return 'executive';
    }
    if (lowerTitle.includes('lead') || lowerTitle.includes('principal') ||
        lowerTitle.includes('architect')) {
      return 'lead';
    }
    if (lowerTitle.includes('senior') || lowerTitle.includes('sr.') ||
        lowerTitle.includes('staff')) {
      return 'senior';
    }
    if (lowerTitle.includes('junior') || lowerTitle.includes('jr.') ||
        lowerTitle.includes('associate') || lowerTitle.includes('entry')) {
      return 'entry';
    }

    return 'mid';
  }

  private generateDefaultBooleanQuery(criteria: ParsedJobCriteria): string {
    const parts: string[] = [];

    // Titles
    if (criteria.titles.length > 0) {
      const titlePart = criteria.titles
        .map((t) => `"${t}"`)
        .join(' OR ');
      parts.push(`(${titlePart})`);
    }

    // Required skills (top 3)
    if (criteria.requiredSkills.length > 0) {
      const skillPart = criteria.requiredSkills
        .slice(0, 3)
        .map((s) => s.includes(' ') ? `"${s}"` : s)
        .join(' OR ');
      parts.push(`(${skillPart})`);
    }

    // Exclusions
    parts.push('NOT recruiter');
    parts.push('NOT "looking for"');

    return parts.join(' AND ');
  }

  // ===========================================================================
  // SKILL TAXONOMY EXTRACTION - Multi-Pass System
  // ===========================================================================

  /**
   * Extract a weighted skill taxonomy from a job description.
   *
   * This uses a 3-pass approach:
   * 1. Structural Analysis (fast, no LLM) - Extract signals from JD structure
   * 2. AI Semantic Analysis (Claude) - Deep understanding of skill importance
   * 3. Synthesis - Merge and boost confidence when signals agree
   *
   * CRITICAL: The extracted taxonomy must be used consistently:
   * - Search queries should use core + critical skills
   * - Scoring should ONLY evaluate against what was searched for
   */
  async extractSkillTaxonomy(input: JobDescriptionInput): Promise<ExtractedSkillTaxonomy> {
    // Pass 1: Structural extraction (no LLM)
    const structural = this.structuralExtract(input);

    // Pass 2: AI semantic analysis
    let aiExtraction: ExtractedSkillTaxonomy;
    try {
      aiExtraction = await this.aiSemanticExtract(input, structural);
    } catch (error) {
      console.warn('[JobDescriptionParser] AI extraction failed, using heuristic fallback:', error);
      return this.heuristicFallback(input, structural);
    }

    // Pass 3: Synthesis - boost confidence when structural and AI agree
    return this.synthesize(aiExtraction, structural);
  }

  /**
   * Pass 1: Structural Analysis - Fast, deterministic extraction
   */
  private structuralExtract(input: JobDescriptionInput): StructuralSignals {
    const text = `${input.title} ${input.description}`.toLowerCase();

    // Extract tech from title
    const titleKeywords = this.extractTechFromTitle(input.title);

    // Identify sections
    const sections = this.identifySections(input.description);

    // Count technology frequency
    const techFrequency = this.countTechnologies(text);

    // Find emphasis patterns
    const emphasisPatterns = this.findEmphasisPatterns(text);

    // Extract experience mentions
    const experienceMentions = this.extractExperienceMentions(text);

    return {
      titleKeywords,
      sections,
      techFrequency,
      emphasisPatterns,
      experienceMentions,
    };
  }

  /**
   * Extract technology keywords from job title
   */
  private extractTechFromTitle(title: string): string[] {
    const titleLower = title.toLowerCase();
    const found: string[] = [];

    // Common tech patterns in titles
    const techPatterns: Array<{ pattern: RegExp; tech: string }> = [
      { pattern: /\breact\b/i, tech: 'React' },
      { pattern: /\bvue\b/i, tech: 'Vue' },
      { pattern: /\bangular\b/i, tech: 'Angular' },
      { pattern: /\btypescript\b|\bts\b/i, tech: 'TypeScript' },
      { pattern: /\bjavascript\b|\bjs\b/i, tech: 'JavaScript' },
      { pattern: /\bpython\b/i, tech: 'Python' },
      { pattern: /\bjava\b(?!script)/i, tech: 'Java' },
      { pattern: /\bgo\b|\bgolang\b/i, tech: 'Go' },
      { pattern: /\brust\b/i, tech: 'Rust' },
      { pattern: /\bc\+\+\b|\bcpp\b/i, tech: 'C++' },
      { pattern: /\bc#\b|\bcsharp\b|\.net\b/i, tech: 'C#' },
      { pattern: /\bruby\b/i, tech: 'Ruby' },
      { pattern: /\bscala\b/i, tech: 'Scala' },
      { pattern: /\bkotlin\b/i, tech: 'Kotlin' },
      { pattern: /\bswift\b/i, tech: 'Swift' },
      { pattern: /\bnode\.?js\b/i, tech: 'Node.js' },
      { pattern: /\baws\b/i, tech: 'AWS' },
      { pattern: /\bgcp\b|\bgoogle cloud\b/i, tech: 'GCP' },
      { pattern: /\bazure\b/i, tech: 'Azure' },
      { pattern: /\bkubernetes\b|\bk8s\b/i, tech: 'Kubernetes' },
      { pattern: /\bterraform\b/i, tech: 'Terraform' },
      { pattern: /\bdevops\b/i, tech: 'DevOps' },
      { pattern: /\bsre\b/i, tech: 'SRE' },
      { pattern: /\bplatform\b/i, tech: 'Platform' },
      { pattern: /\bdata\b/i, tech: 'Data' },
      { pattern: /\bml\b|\bmachine learning\b/i, tech: 'ML' },
      { pattern: /\bai\b|\bartificial intelligence\b/i, tech: 'AI' },
    ];

    for (const { pattern, tech } of techPatterns) {
      if (pattern.test(titleLower)) {
        found.push(tech);
      }
    }

    return found;
  }

  /**
   * Identify and parse sections from JD text
   */
  private identifySections(text: string): StructuralSignals['sections'] {
    const sections = {
      requirements: [] as string[],
      preferred: [] as string[],
      responsibilities: [] as string[],
    };

    // Common section headers
    const requirementHeaders = /(?:requirements?|qualifications?|must have|required|essential|what you.ll need)/i;
    const preferredHeaders = /(?:preferred|nice to have|bonus|desirable|what.ll make you stand out|plus)/i;
    const responsibilityHeaders = /(?:responsibilities|what you.ll do|duties|role|about the role)/i;

    const lines = text.split('\n');
    let currentSection: 'requirements' | 'preferred' | 'responsibilities' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for section headers
      if (requirementHeaders.test(trimmed)) {
        currentSection = 'requirements';
        continue;
      } else if (preferredHeaders.test(trimmed)) {
        currentSection = 'preferred';
        continue;
      } else if (responsibilityHeaders.test(trimmed)) {
        currentSection = 'responsibilities';
        continue;
      }

      // Add content to current section
      if (currentSection && (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || /^\d+\./.test(trimmed))) {
        const content = trimmed.replace(/^[-•*]\s*|\d+\.\s*/g, '').trim();
        if (content) {
          sections[currentSection].push(content);
        }
      }
    }

    return sections;
  }

  /**
   * Count how many times each technology appears in the text
   */
  private countTechnologies(text: string): Record<string, number> {
    const counts: Record<string, number> = {};

    // Extended list of technologies to detect
    const technologies = [
      // Languages
      'react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java', 'go', 'golang',
      'rust', 'c++', 'cpp', 'c#', 'csharp', 'ruby', 'scala', 'kotlin', 'swift', 'php',
      // Frameworks
      'node', 'nodejs', 'express', 'fastapi', 'django', 'flask', 'spring', 'rails',
      'next', 'nextjs', 'nuxt', 'svelte', 'remix',
      // Databases
      'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
      'dynamodb', 'snowflake', 'bigquery',
      // Cloud & Infra
      'aws', 'azure', 'gcp', 'google cloud', 'kubernetes', 'k8s', 'docker', 'terraform',
      'ansible', 'pulumi', 'cloudformation',
      // Tools
      'git', 'jenkins', 'circleci', 'github actions', 'gitlab', 'datadog', 'prometheus',
      'grafana', 'kafka', 'rabbitmq', 'graphql', 'rest', 'grpc',
      // Practices
      'ci/cd', 'cicd', 'agile', 'scrum', 'tdd', 'devops', 'sre', 'microservices',
    ];

    for (const tech of technologies) {
      const regex = new RegExp(`\\b${tech.replace(/[+#]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        // Normalize the tech name
        const normalized = this.normalizeTechName(tech);
        counts[normalized] = (counts[normalized] || 0) + matches.length;
      }
    }

    return counts;
  }

  /**
   * Normalize technology names to canonical form
   */
  private normalizeTechName(tech: string): string {
    const normMap: Record<string, string> = {
      'golang': 'Go',
      'nodejs': 'Node.js',
      'node': 'Node.js',
      'postgres': 'PostgreSQL',
      'postgresql': 'PostgreSQL',
      'k8s': 'Kubernetes',
      'kubernetes': 'Kubernetes',
      'js': 'JavaScript',
      'javascript': 'JavaScript',
      'ts': 'TypeScript',
      'typescript': 'TypeScript',
      'csharp': 'C#',
      'c#': 'C#',
      'cpp': 'C++',
      'c++': 'C++',
      'nextjs': 'Next.js',
      'next': 'Next.js',
      'gcp': 'GCP',
      'google cloud': 'GCP',
      'cicd': 'CI/CD',
      'ci/cd': 'CI/CD',
    };
    return normMap[tech.toLowerCase()] || tech.charAt(0).toUpperCase() + tech.slice(1).toLowerCase();
  }

  /**
   * Find emphasis patterns like "expert in X", "deep X experience"
   */
  private findEmphasisPatterns(text: string): StructuralSignals['emphasisPatterns'] {
    const patterns: StructuralSignals['emphasisPatterns'] = [];

    const emphasisRegexes = [
      /(?:expert(?:ise)?\s+(?:in|with)\s+)(\w+(?:\s+\w+)?)/gi,
      /(?:deep\s+(?:experience|expertise|knowledge)\s+(?:in|with|of)\s+)(\w+(?:\s+\w+)?)/gi,
      /(?:strong\s+(?:background|experience)\s+(?:in|with)\s+)(\w+(?:\s+\w+)?)/gi,
      /(?:proficient\s+(?:in|with)\s+)(\w+(?:\s+\w+)?)/gi,
      /(?:mastery\s+of\s+)(\w+(?:\s+\w+)?)/gi,
      /(?:extensive\s+experience\s+(?:in|with)\s+)(\w+(?:\s+\w+)?)/gi,
    ];

    for (const regex of emphasisRegexes) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        patterns.push({
          skill: match[1].trim(),
          pattern: match[0].trim(),
        });
      }
    }

    return patterns;
  }

  /**
   * Extract experience requirements like "5+ years of Python"
   */
  private extractExperienceMentions(text: string): StructuralSignals['experienceMentions'] {
    const mentions: StructuralSignals['experienceMentions'] = [];

    // Pattern: "X+ years of/in/with [technology]"
    const regex = /(\d+)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience\s+)?(?:in|with|of)?\s*(\w+(?:\s+\w+)?)/gi;

    let match;
    while ((match = regex.exec(text)) !== null) {
      const years = parseInt(match[1], 10);
      const skill = match[2].trim();
      if (years > 0 && skill.length > 1) {
        mentions.push({ skill, years });
      }
    }

    return mentions;
  }

  /**
   * Pass 2: AI Semantic Analysis - Deep understanding via Claude
   */
  private async aiSemanticExtract(
    input: JobDescriptionInput,
    structural: StructuralSignals
  ): Promise<ExtractedSkillTaxonomy> {
    const claude = getClaudeClient();

    const prompt = this.buildTaxonomyExtractionPrompt(input, structural);

    const response = await claude.chat({
      systemPrompt: TAXONOMY_EXTRACTION_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2, // Low for consistency
      maxTokens: 2000,
    });

    const parsed = claude.parseJsonResponse<ExtractedSkillTaxonomy>(response);

    // Validate and fill defaults
    return this.validateTaxonomy(parsed, input);
  }

  /**
   * Build the prompt for taxonomy extraction
   */
  private buildTaxonomyExtractionPrompt(input: JobDescriptionInput, structural: StructuralSignals): string {
    const structuralContext = `
## Structural Analysis (Pre-computed signals)

**Technologies from Title:** ${structural.titleKeywords.join(', ') || 'None detected'}

**Technology Frequency:**
${Object.entries(structural.techFrequency)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([tech, count]) => `- ${tech}: ${count} mentions`)
  .join('\n') || 'None detected'}

**Emphasis Patterns:**
${structural.emphasisPatterns.slice(0, 5).map(p => `- "${p.pattern}"`).join('\n') || 'None detected'}

**Experience Requirements:**
${structural.experienceMentions.map(m => `- ${m.years}+ years of ${m.skill}`).join('\n') || 'None detected'}

**Requirements Section Items:**
${structural.sections.requirements.slice(0, 10).map(r => `- ${r}`).join('\n') || 'Not identified'}

**Preferred Section Items:**
${structural.sections.preferred.slice(0, 5).map(r => `- ${r}`).join('\n') || 'Not identified'}
`;

    return `Analyze this job description and extract a weighted skill taxonomy.

## Job Information

**Title:** ${input.title}
**Location:** ${input.location || 'Not specified'}
**Remote Type:** ${input.remoteType || 'Not specified'}
**Company:** ${input.companyName || 'Not specified'}
**Industry:** ${input.industry || 'Not specified'}

**Full Description:**
${input.description}

${input.requirements?.length ? `**Explicit Requirements:**\n${input.requirements.map(r => `- ${r}`).join('\n')}` : ''}

${input.preferredSkills?.length ? `**Explicit Preferred Skills:**\n${input.preferredSkills.map(s => `- ${s}`).join('\n')}` : ''}

${structuralContext}

## Your Task

Based on ALL available information, determine:

1. **Core Competency (P0)**: What is THE most critical technology? This is the day-1 blocker.
   - Consider: What appears in the title? What has the highest frequency? What has explicit experience requirements?

2. **Critical Skills (P1)**: What 3-5 skills are absolute must-haves beyond the core?
   - Weight 0.8-1.0 based on importance

3. **Required Skills (P2)**: What skills will they need within the first month?
   - Weight 0.6-0.8

4. **Preferred Skills (P3)**: What accelerates onboarding but isn't blocking?
   - Weight 0.3-0.6

5. **Adjacent Skills (P4)**: What shows breadth but isn't decisive?

6. **Role Classification**: What domain, level, and type is this role?

Output valid JSON matching the ExtractedSkillTaxonomy interface.`;
  }

  /**
   * Validate and fill defaults for taxonomy
   */
  private validateTaxonomy(parsed: Partial<ExtractedSkillTaxonomy>, input: JobDescriptionInput): ExtractedSkillTaxonomy {
    return {
      coreCompetency: parsed.coreCompetency || {
        skill: 'Unknown',
        confidence: 0.5,
        evidence: ['Could not determine from JD'],
        synonyms: [],
        minYearsExpected: 3,
      },
      criticalSkills: parsed.criticalSkills || [],
      requiredSkills: parsed.requiredSkills || [],
      preferredSkills: parsed.preferredSkills || [],
      adjacentSkills: parsed.adjacentSkills || [],
      roleType: parsed.roleType || {
        domain: this.inferDomain(input.title),
        level: this.inferLevelFromTitle(input.title),
        isManagement: this.isManagementRole(input.title),
        isContractor: false,
      },
      experienceProfile: parsed.experienceProfile || {
        totalYearsMin: 3,
        totalYearsMax: 10,
        yearsInPrimarySkill: 2,
        scaleIndicators: [],
      },
      extractionConfidence: parsed.extractionConfidence || 0.7,
      extractionMethod: 'ai',
      warnings: parsed.warnings || [],
    };
  }

  /**
   * Infer role domain from title
   */
  private inferDomain(title: string): RoleDomain {
    const lower = title.toLowerCase();
    if (/front[\s-]?end|ui|ux|react|vue|angular/i.test(lower)) return 'frontend';
    if (/back[\s-]?end|api|server/i.test(lower)) return 'backend';
    if (/full[\s-]?stack/i.test(lower)) return 'fullstack';
    if (/mobile|ios|android|react native|flutter/i.test(lower)) return 'mobile';
    if (/devops|sre|site reliability/i.test(lower)) return 'devops';
    if (/platform|infrastructure|cloud/i.test(lower)) return 'platform';
    if (/data\s+engineer|etl|pipeline/i.test(lower)) return 'data';
    if (/machine learning|ml|ai|data scientist/i.test(lower)) return 'ml';
    if (/security|infosec|appsec/i.test(lower)) return 'security';
    return 'backend'; // Default
  }

  /**
   * Infer seniority level from title
   */
  private inferLevelFromTitle(title: string): SeniorityLevel {
    const lower = title.toLowerCase();
    if (/\b(cto|ceo|cio|chief)\b/.test(lower)) return 'executive';
    if (/\b(vp|vice president)\b/.test(lower)) return 'vp';
    if (/\bdirector\b/.test(lower)) return 'director';
    if (/\b(engineering manager|em)\b/.test(lower)) return 'manager';
    if (/\b(tech lead|team lead)\b/.test(lower)) return 'lead';
    if (/\bprincipal\b/.test(lower)) return 'principal';
    if (/\bstaff\b/.test(lower)) return 'staff';
    if (/\bsenior\b|\bsr\.?\b/.test(lower)) return 'senior';
    if (/\bjunior\b|\bjr\.?\b|\bentry\b/.test(lower)) return 'junior';
    return 'mid';
  }

  /**
   * Check if role involves people management
   */
  private isManagementRole(title: string): boolean {
    const lower = title.toLowerCase();
    return /\b(manager|director|vp|vice president|chief|head of|lead)\b/.test(lower);
  }

  /**
   * Pass 3: Synthesis - Boost confidence when structural and AI agree
   */
  private synthesize(ai: ExtractedSkillTaxonomy, structural: StructuralSignals): ExtractedSkillTaxonomy {
    // Boost core competency confidence if it appears in title
    if (structural.titleKeywords.some(k =>
      k.toLowerCase() === ai.coreCompetency.skill.toLowerCase() ||
      ai.coreCompetency.synonyms.some(s => s.toLowerCase() === k.toLowerCase())
    )) {
      ai.coreCompetency.confidence = Math.min(1, ai.coreCompetency.confidence * 1.3);
      ai.coreCompetency.evidence.push('Confirmed: appears in job title');
    }

    // Boost confidence if high frequency
    const coreFreq = structural.techFrequency[ai.coreCompetency.skill] ||
      structural.techFrequency[ai.coreCompetency.skill.toLowerCase()] || 0;
    if (coreFreq >= 3) {
      ai.coreCompetency.confidence = Math.min(1, ai.coreCompetency.confidence * 1.2);
      ai.coreCompetency.evidence.push(`Confirmed: mentioned ${coreFreq} times`);
    }

    // Boost critical skills that have experience requirements
    for (const skill of ai.criticalSkills) {
      const expMention = structural.experienceMentions.find(m =>
        m.skill.toLowerCase().includes(skill.skill.toLowerCase()) ||
        skill.skill.toLowerCase().includes(m.skill.toLowerCase())
      );
      if (expMention) {
        skill.weight = Math.min(1, skill.weight * 1.1);
        skill.evidence.push(`${expMention.years}+ years explicitly required`);
      }
    }

    // Boost skills that have emphasis patterns
    for (const pattern of structural.emphasisPatterns) {
      const matchedSkill = ai.criticalSkills.find(s =>
        s.skill.toLowerCase().includes(pattern.skill.toLowerCase())
      );
      if (matchedSkill) {
        matchedSkill.weight = Math.min(1, matchedSkill.weight * 1.1);
        matchedSkill.evidence.push(`Emphasized: "${pattern.pattern}"`);
      }
    }

    ai.extractionMethod = 'hybrid';
    return ai;
  }

  /**
   * Heuristic fallback when AI is unavailable
   */
  private heuristicFallback(input: JobDescriptionInput, structural: StructuralSignals): ExtractedSkillTaxonomy {
    // Determine core competency from title or highest frequency
    let coreSkill = structural.titleKeywords[0];
    if (!coreSkill) {
      const sorted = Object.entries(structural.techFrequency).sort((a, b) => b[1] - a[1]);
      coreSkill = sorted[0]?.[0] || 'Unknown';
    }

    // Build critical skills from high-frequency items
    const criticalSkills: WeightedSkill[] = Object.entries(structural.techFrequency)
      .filter(([skill]) => skill !== coreSkill)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([skill, freq]) => ({
        skill,
        weight: Math.min(1, 0.6 + (freq * 0.1)),
        category: this.inferCategory(skill),
        evidence: [`Mentioned ${freq} times`],
        synonyms: [],
      }));

    return {
      coreCompetency: {
        skill: coreSkill,
        confidence: 0.5,
        evidence: structural.titleKeywords.includes(coreSkill) ? ['From job title'] : ['Highest frequency in JD'],
        synonyms: [],
        minYearsExpected: 3,
      },
      criticalSkills,
      requiredSkills: [],
      preferredSkills: [],
      adjacentSkills: [],
      roleType: {
        domain: this.inferDomain(input.title),
        level: this.inferLevelFromTitle(input.title),
        isManagement: this.isManagementRole(input.title),
        isContractor: false,
      },
      experienceProfile: {
        totalYearsMin: 3,
        totalYearsMax: 10,
        yearsInPrimarySkill: 2,
        scaleIndicators: [],
      },
      extractionConfidence: 0.4,
      extractionMethod: 'heuristic',
      warnings: ['AI extraction unavailable, using heuristic fallback'],
    };
  }

  /**
   * Infer skill category from name
   */
  private inferCategory(skill: string): SkillCategory {
    const lower = skill.toLowerCase();

    // Languages
    if (/python|java|go|rust|typescript|javascript|ruby|scala|kotlin|swift|c\+\+|c#|php/.test(lower)) {
      return 'language';
    }
    // Frameworks
    if (/react|vue|angular|django|flask|spring|rails|next|express|fastapi/.test(lower)) {
      return 'framework';
    }
    // Databases
    if (/postgres|mysql|mongodb|redis|elasticsearch|cassandra|dynamodb|snowflake/.test(lower)) {
      return 'database';
    }
    // Cloud
    if (/aws|azure|gcp|google cloud/.test(lower)) {
      return 'cloud';
    }
    // Tools
    if (/docker|kubernetes|terraform|jenkins|git|datadog|prometheus/.test(lower)) {
      return 'tool';
    }
    // Architecture
    if (/microservices|distributed|event.driven|serverless/.test(lower)) {
      return 'architecture';
    }

    return 'tool'; // Default
  }
}

// =============================================================================
// SYSTEM PROMPT FOR TAXONOMY EXTRACTION
// =============================================================================

const TAXONOMY_EXTRACTION_SYSTEM_PROMPT = `You are a distinguished technical hiring manager with 20+ years of experience.

Your job is to identify what ACTUALLY matters for this role - not what's listed, but what would make you reject a candidate.

CRITICAL THINKING FRAMEWORK:
1. What would this person do on Day 1? That technology is P0 (Core).
2. What would they need to learn in Week 1? Those are P1 (Critical).
3. What would make them faster but isn't blocking? Those are P2 (Required).
4. What's nice-to-have? P3 (Preferred).
5. What's just buzzword padding? P4 (Adjacent) or ignore.

ROLE ARCHETYPE PATTERNS:

Frontend Engineer:
- Core: Usually React/Vue/Angular (whichever is mentioned first/most in title or description)
- Critical: JavaScript/TypeScript, CSS/Styling
- Required: Testing (Jest/Cypress), Build tools
- Adjacent: Backend exposure, DevOps awareness

Backend Engineer:
- Core: Primary language (Go, Python, Java, Node based on emphasis)
- Critical: Database (SQL + likely one NoSQL), API design (REST/GraphQL)
- Required: Cloud platform, Containerization
- Adjacent: Frontend, Infrastructure as Code

Platform/DevOps/SRE:
- Core: Cloud platform (AWS/GCP/Azure) OR Kubernetes (based on which is emphasized more)
- Critical: IaC (Terraform/Pulumi), Containers
- Required: Scripting (Python/Bash), Monitoring/Observability
- Adjacent: Specific application stacks

Data Engineer:
- Core: Python + SQL (almost always together)
- Critical: Data pipeline tools (Spark/Airflow/dbt)
- Required: Cloud data services
- Adjacent: ML basics

SKILL WEIGHT GUIDELINES:
- P0 Core: This is THE skill. Always weight 1.0
- P1 Critical: Weight 0.8-1.0 (must-have, day-1 blocker)
- P2 Required: Weight 0.6-0.8 (needed in first month)
- P3 Preferred: Weight 0.3-0.6 (accelerates onboarding)
- P4 Adjacent: Weight 0.1-0.3 (shows breadth)

IMPORTANT - SYNONYM DETECTION:
Always include common synonyms/aliases:
- Go ↔ Golang
- JavaScript ↔ JS
- TypeScript ↔ TS
- Node.js ↔ Node ↔ NodeJS
- PostgreSQL ↔ Postgres
- Kubernetes ↔ K8s
- React ↔ ReactJS ↔ React.js

Output valid JSON only - no markdown, no explanation outside the JSON.

{
  "coreCompetency": {
    "skill": "<THE most critical skill>",
    "confidence": <0.0-1.0>,
    "evidence": ["<reason 1>", "<reason 2>"],
    "synonyms": ["<alias1>", "<alias2>"],
    "minYearsExpected": <number>
  },
  "criticalSkills": [
    {
      "skill": "<skill name>",
      "weight": <0.8-1.0>,
      "category": "<language|framework|database|cloud|tool|architecture|domain|process>",
      "evidence": ["<why this is critical>"],
      "synonyms": ["<aliases>"]
    }
  ],
  "requiredSkills": [...],
  "preferredSkills": [
    {
      "skill": "<skill>",
      "weight": <0.3-0.6>,
      "category": "<category>"
    }
  ],
  "adjacentSkills": ["<skill1>", "<skill2>"],
  "roleType": {
    "domain": "<frontend|backend|fullstack|mobile|devops|platform|data|ml|security|infra>",
    "level": "<junior|mid|senior|staff|principal|lead|manager|director|vp|executive>",
    "isManagement": <boolean>,
    "isContractor": <boolean>
  },
  "experienceProfile": {
    "totalYearsMin": <number>,
    "totalYearsMax": <number>,
    "yearsInPrimarySkill": <number>,
    "leadershipYears": <number or null>,
    "scaleIndicators": ["<indicator1>"]
  },
  "extractionConfidence": <0.0-1.0>,
  "extractionMethod": "ai",
  "warnings": ["<any edge cases or uncertainties>"]
}`;

// =============================================================================
// SINGLETON
// =============================================================================

let instance: JobDescriptionParser | null = null;

export function getJobDescriptionParser(): JobDescriptionParser {
  if (!instance) {
    instance = new JobDescriptionParser();
  }
  return instance;
}
