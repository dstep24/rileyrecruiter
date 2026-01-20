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

import { getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { UnipileSearchApi } from '../../integrations/linkedin/UnipileClient.js';

// =============================================================================
// TYPES
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

    const response = await claude.message({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract JSON from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/);
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
}

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
