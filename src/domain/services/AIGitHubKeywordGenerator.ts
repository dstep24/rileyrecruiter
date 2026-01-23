/**
 * AI GitHub Keyword Generator
 *
 * Uses Claude to analyze job descriptions and generate optimal keywords
 * for GitHub user search. GitHub's user search API is limited - it only
 * searches username, email, and full name (NOT bios). However, keywords
 * are useful for:
 * 1. Filtering results after API search
 * 2. Scoring candidates by bio relevance
 * 3. Building search context for the user
 *
 * The AI understands technical domain knowledge to suggest keywords that:
 * - Appear frequently in developer bios
 * - Are specific enough to filter noise
 * - Cover tool/framework ecosystem (not just the main tech)
 */

import { getClaudeClient, ClaudeClient } from '../../integrations/llm/ClaudeClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GitHubKeywordGeneratorInput {
  jobTitle: string;
  jobDescription?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  intakeNotes?: string;
  existingSearchStrategy?: {
    mustHaveSkills?: string[];
    niceToHaveSkills?: string[];
    seniorityLevel?: string;
  };
}

export interface GitHubKeywordResult {
  /** Primary keywords - most likely to appear in GitHub bios */
  primaryKeywords: string[];

  /** Secondary keywords - good for scoring/filtering */
  secondaryKeywords: string[];

  /** GitHub language filter recommendation */
  suggestedLanguage: string;

  /** Alternative languages to consider */
  alternativeLanguages: string[];

  /** Reasoning for keyword selection */
  reasoning: string;

  /** Confidence in the keyword selection (0-1) */
  confidence: number;
}

// =============================================================================
// PROMPTS
// =============================================================================

const GITHUB_KEYWORD_SYSTEM_PROMPT = `You are an expert technical recruiter who deeply understands how developers describe themselves on GitHub.

Your job is to analyze a job description and generate optimal keywords for finding candidates on GitHub.

CRITICAL CONTEXT ABOUT GITHUB SEARCH:
- GitHub's user search API searches username, email, and full name (NOT bios)
- BUT we filter and score results using bio content after the API search
- So your keywords should be terms that developers commonly put in their GitHub bios

WHAT DEVELOPERS PUT IN GITHUB BIOS:
- Current employer or "Open to work"
- Job title variations: "Senior SRE", "Platform Engineer", "DevOps Specialist"
- Technology stack: specific tools, frameworks, cloud providers
- Specializations: "Kubernetes expert", "AWS certified", "Terraform enthusiast"
- Open source project names they contribute to
- Personal interests that overlap: "Building observability tools", "Infrastructure as code"

KEYWORD SELECTION PRINCIPLES:
1. **Be specific** - "Kubernetes" is better than "DevOps", "Terraform" is better than "IaC"
2. **Include ecosystems** - For "Kubernetes", also suggest: "K8s", "Helm", "ArgoCD", "Istio"
3. **Use common abbreviations** - Developers write "K8s" not "Kubernetes", "TF" for Terraform
4. **Include certifications** - "CKA", "AWS SAA", "GCP ACE" if relevant
5. **Project names matter** - "Prometheus", "Grafana", "Datadog" for observability roles
6. **Avoid generic terms** - Skip "Software", "Engineer", "Developer", "Senior"

LANGUAGE SELECTION:
- GitHub's language filter finds users with PUBLIC REPOS in that language
- Pick the PRIMARY language for the role, not all languages mentioned
- DevOps/SRE: Often "Go" or "Python" (not "Terraform" - it's HCL)
- Full-stack: Usually "TypeScript" or "JavaScript"
- Backend: "Go", "Python", "Java", "Rust" depending on stack
- Data: "Python" almost always
- Mobile: "Swift" (iOS), "Kotlin" (Android)

Output valid JSON only - no markdown, no explanation outside the JSON.`;

function buildKeywordGenerationPrompt(input: GitHubKeywordGeneratorInput): string {
  const intakeSection = input.intakeNotes ? `
### Intake Notes (High Priority)
${input.intakeNotes}
` : '';

  const existingStrategySection = input.existingSearchStrategy ? `
### Existing Search Strategy
Must-have skills: ${input.existingSearchStrategy.mustHaveSkills?.join(', ') || 'None'}
Nice-to-have skills: ${input.existingSearchStrategy.niceToHaveSkills?.join(', ') || 'None'}
Seniority level: ${input.existingSearchStrategy.seniorityLevel || 'Not specified'}
` : '';

  return `Analyze this job and generate optimal GitHub search keywords.

## Job Details
Title: ${input.jobTitle}
${intakeSection}
### Job Description
${input.jobDescription || 'Not provided'}

### Required Skills
${input.requiredSkills?.join(', ') || 'Not specified'}

### Preferred Skills
${input.preferredSkills?.join(', ') || 'Not specified'}
${existingStrategySection}
## Your Task

Generate keywords optimized for finding candidates on GitHub:

1. **Primary Keywords (5-8)**: Terms MOST likely to appear in relevant developer bios
   - Be specific: tools, frameworks, cloud platforms, certifications
   - Include common abbreviations (K8s, TF, etc.)
   - Focus on what makes this role unique

2. **Secondary Keywords (5-10)**: Broader terms for scoring/filtering
   - Related technologies in the ecosystem
   - Alternative names for the same tools
   - Adjacent skills that strong candidates might have

3. **Language Selection**: Pick the SINGLE best language filter
   - Based on what language repos they'd likely have
   - Remember: Terraform files are HCL, not Python

4. **Alternative Languages**: 1-2 other languages that might work

## Output Format (JSON only)

{
  "primaryKeywords": ["<keyword1>", "<keyword2>", "...5-8 total"],
  "secondaryKeywords": ["<keyword1>", "<keyword2>", "...5-10 total"],
  "suggestedLanguage": "<go|python|typescript|java|rust|etc>",
  "alternativeLanguages": ["<lang1>", "<lang2>"],
  "reasoning": "<brief explanation of keyword selection>",
  "confidence": <0.0-1.0>
}`;
}

// =============================================================================
// AI GITHUB KEYWORD GENERATOR CLASS
// =============================================================================

export class AIGitHubKeywordGenerator {
  private claudeClient: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient || getClaudeClient();
  }

  /**
   * Generate optimal GitHub search keywords from a job description
   */
  async generateKeywords(input: GitHubKeywordGeneratorInput): Promise<GitHubKeywordResult> {
    const prompt = buildKeywordGenerationPrompt(input);

    try {
      const response = await this.claudeClient.chat({
        systemPrompt: GITHUB_KEYWORD_SYSTEM_PROMPT,
        prompt,
        temperature: 0.3,
        maxTokens: 1024,
      });

      const parsed = this.claudeClient.parseJsonResponse<GitHubKeywordResult>(response);

      // Validate and ensure required fields
      return {
        primaryKeywords: this.cleanKeywords(parsed.primaryKeywords || []),
        secondaryKeywords: this.cleanKeywords(parsed.secondaryKeywords || []),
        suggestedLanguage: this.normalizeLanguage(parsed.suggestedLanguage || ''),
        alternativeLanguages: (parsed.alternativeLanguages || []).map(l => this.normalizeLanguage(l)),
        reasoning: parsed.reasoning || '',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
      };
    } catch (error) {
      console.error('[AIGitHubKeywordGenerator] Error generating keywords:', error);
      // Return fallback keywords based on input
      return this.generateFallbackKeywords(input);
    }
  }

  /**
   * Clean and validate keywords
   */
  private cleanKeywords(keywords: string[]): string[] {
    return keywords
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 1 && k.length < 30)
      .filter(k => !['software', 'engineer', 'developer', 'senior', 'junior', 'the', 'and', 'or'].includes(k));
  }

  /**
   * Normalize language name for GitHub API
   */
  private normalizeLanguage(lang: string): string {
    const normalized = lang.toLowerCase().trim();

    // Map common variations
    const langMap: Record<string, string> = {
      'typescript': 'typescript',
      'ts': 'typescript',
      'javascript': 'javascript',
      'js': 'javascript',
      'python': 'python',
      'py': 'python',
      'golang': 'go',
      'go': 'go',
      'java': 'java',
      'rust': 'rust',
      'c++': 'cpp',
      'cpp': 'cpp',
      'c#': 'csharp',
      'csharp': 'csharp',
      'ruby': 'ruby',
      'swift': 'swift',
      'kotlin': 'kotlin',
      'scala': 'scala',
      'php': 'php',
      'shell': 'shell',
      'bash': 'shell',
      'hcl': 'hcl',
      'terraform': 'hcl',
    };

    return langMap[normalized] || normalized;
  }

  /**
   * Generate fallback keywords when AI fails
   */
  private generateFallbackKeywords(input: GitHubKeywordGeneratorInput): GitHubKeywordResult {
    const primaryKeywords: string[] = [];
    const secondaryKeywords: string[] = [];

    // Extract from required skills
    const skills = [
      ...(input.requiredSkills || []),
      ...(input.existingSearchStrategy?.mustHaveSkills || []),
    ];

    for (const skill of skills) {
      const lower = skill.toLowerCase();
      // Skip generic terms
      if (!['software', 'engineering', 'development', 'programming'].includes(lower)) {
        if (primaryKeywords.length < 5) {
          primaryKeywords.push(lower);
        } else {
          secondaryKeywords.push(lower);
        }
      }
    }

    // Extract from preferred/nice-to-have skills
    const preferredSkills = [
      ...(input.preferredSkills || []),
      ...(input.existingSearchStrategy?.niceToHaveSkills || []),
    ];

    for (const skill of preferredSkills) {
      const lower = skill.toLowerCase();
      if (!primaryKeywords.includes(lower) && !secondaryKeywords.includes(lower)) {
        secondaryKeywords.push(lower);
      }
    }

    // Detect language from title or skills
    const suggestedLanguage = this.detectLanguageFromContext(input);

    return {
      primaryKeywords: primaryKeywords.slice(0, 8),
      secondaryKeywords: secondaryKeywords.slice(0, 10),
      suggestedLanguage,
      alternativeLanguages: [],
      reasoning: 'Generated from job skills (AI unavailable)',
      confidence: 0.5,
    };
  }

  /**
   * Detect programming language from job context
   */
  private detectLanguageFromContext(input: GitHubKeywordGeneratorInput): string {
    const text = `${input.jobTitle} ${input.jobDescription || ''} ${input.requiredSkills?.join(' ') || ''}`.toLowerCase();

    // Priority order - check specific frameworks first
    const patterns: Array<{ pattern: RegExp; lang: string }> = [
      { pattern: /\b(react|next\.js|nextjs|angular|vue)\b/, lang: 'typescript' },
      { pattern: /\btypescript\b/, lang: 'typescript' },
      { pattern: /\b(kubernetes|k8s|docker|helm|argocd)\b/, lang: 'go' },
      { pattern: /\b(terraform|ansible|puppet|chef)\b/, lang: 'python' },
      { pattern: /\b(aws|azure|gcp|cloud)\b/, lang: 'python' },
      { pattern: /\b(django|flask|fastapi|pandas|numpy)\b/, lang: 'python' },
      { pattern: /\bpython\b/, lang: 'python' },
      { pattern: /\b(spring|springboot|spring boot)\b/, lang: 'java' },
      { pattern: /\bjava\b/, lang: 'java' },
      { pattern: /\b(go|golang)\b/, lang: 'go' },
      { pattern: /\brust\b/, lang: 'rust' },
      { pattern: /\b(swift|ios)\b/, lang: 'swift' },
      { pattern: /\b(kotlin|android)\b/, lang: 'kotlin' },
      { pattern: /\bruby\b/, lang: 'ruby' },
      { pattern: /\bscala\b/, lang: 'scala' },
    ];

    for (const { pattern, lang } of patterns) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return 'python'; // Default fallback
  }

  /**
   * Quick keyword generation without AI (for immediate UI response)
   */
  generateQuickKeywords(input: GitHubKeywordGeneratorInput): GitHubKeywordResult {
    return this.generateFallbackKeywords(input);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: AIGitHubKeywordGenerator | null = null;

export function getAIGitHubKeywordGenerator(): AIGitHubKeywordGenerator {
  if (!instance) {
    instance = new AIGitHubKeywordGenerator();
  }
  return instance;
}

/**
 * Detect if this is an infrastructure/platform role based on job title and skills
 */
function detectInfraRole(jobTitle: string, skills: string[]): boolean {
  const titleLower = jobTitle.toLowerCase();
  const allText = `${titleLower} ${skills.join(' ').toLowerCase()}`;

  const infraPatterns = [
    /\bplatform\s+engineer/,
    /\bdevops/,
    /\bsre\b/,
    /\bsite\s+reliability/,
    /\binfrastructure\s+engineer/,
    /\bcloud\s+engineer/,
    /\bcloud\s+architect/,
    /\bsystems?\s+engineer/,
    /\bdevsecops/,
    /\bterraform/,
    /\bbicep/,
    /\bazure\s+platform/,
    /\baws\s+platform/,
    /\bgcp\s+platform/,
    /\blanding\s+zones?/,
  ];

  return infraPatterns.some(pattern => pattern.test(allText));
}

/**
 * Generate keywords without AI (static function for use when Claude is unavailable)
 * This is useful when ANTHROPIC_API_KEY is not set.
 */
export function generateGitHubKeywordsFallback(input: GitHubKeywordGeneratorInput): GitHubKeywordResult {
  const primaryKeywords: string[] = [];
  const secondaryKeywords: string[] = [];

  // Extract from required skills
  const skills = [
    ...(input.requiredSkills || []),
    ...(input.existingSearchStrategy?.mustHaveSkills || []),
  ];

  // Detect if this is an infra/platform role
  const isInfraRole = detectInfraRole(input.jobTitle, skills);

  for (const skill of skills) {
    const lower = skill.toLowerCase();
    if (!['software', 'engineering', 'development', 'programming'].includes(lower)) {
      if (primaryKeywords.length < 5) {
        primaryKeywords.push(lower);
      } else {
        secondaryKeywords.push(lower);
      }
    }
  }

  // For infra roles, add common infra keywords if not already present
  if (isInfraRole) {
    const infraKeywords = ['terraform', 'kubernetes', 'azure', 'aws', 'infrastructure', 'devops', 'ci/cd', 'iac'];
    for (const kw of infraKeywords) {
      if (!primaryKeywords.includes(kw) && !secondaryKeywords.includes(kw)) {
        if (secondaryKeywords.length < 10) {
          secondaryKeywords.push(kw);
        }
      }
    }
  }

  // Extract from preferred skills
  const preferredSkills = [
    ...(input.preferredSkills || []),
    ...(input.existingSearchStrategy?.niceToHaveSkills || []),
  ];

  for (const skill of preferredSkills) {
    const lower = skill.toLowerCase();
    if (!primaryKeywords.includes(lower) && !secondaryKeywords.includes(lower)) {
      secondaryKeywords.push(lower);
    }
  }

  // Detect the most prevalent programming language from the full JD context
  const text = `${input.jobTitle} ${input.jobDescription || ''} ${input.requiredSkills?.join(' ') || ''} ${input.preferredSkills?.join(' ') || ''}`.toLowerCase();

  // Language/framework patterns mapped to GitHub languages
  // For infra roles, we boost HCL/Shell patterns
  const languagePatterns: Array<{ pattern: RegExp; lang: string; weight: number }> = [
    // Direct language mentions (higher weight)
    { pattern: /\btypescript\b/g, lang: 'typescript', weight: 3 },
    { pattern: /\bjavascript\b/g, lang: 'javascript', weight: 3 },
    { pattern: /\bpython\b/g, lang: 'python', weight: 3 },
    { pattern: /\bjava\b/g, lang: 'java', weight: 3 },
    { pattern: /\b(golang|go\s+language)\b/g, lang: 'go', weight: 3 },
    { pattern: /\brust\b/g, lang: 'rust', weight: 3 },
    { pattern: /\bswift\b/g, lang: 'swift', weight: 3 },
    { pattern: /\bkotlin\b/g, lang: 'kotlin', weight: 3 },
    { pattern: /\bruby\b/g, lang: 'ruby', weight: 3 },
    { pattern: /\bscala\b/g, lang: 'scala', weight: 3 },
    { pattern: /\bc\+\+\b/g, lang: 'cpp', weight: 3 },
    { pattern: /\bc#\b/g, lang: 'csharp', weight: 3 },
    { pattern: /\bpowershell\b/g, lang: 'powershell', weight: 3 },
    { pattern: /\bbash\b/g, lang: 'shell', weight: 3 },
    { pattern: /\bshell\b/g, lang: 'shell', weight: 3 },
    // Frameworks/tools that imply a language (lower weight)
    { pattern: /\b(react|next\.?js|angular|vue)\b/g, lang: 'typescript', weight: 2 },
    { pattern: /\b(node\.?js|express)\b/g, lang: 'javascript', weight: 2 },
    { pattern: /\b(django|flask|fastapi|pandas|numpy|pytorch|tensorflow)\b/g, lang: 'python', weight: 2 },
    { pattern: /\b(spring|springboot)\b/g, lang: 'java', weight: 2 },
    { pattern: /\b(kubernetes|k8s|docker|helm|argocd)\b/g, lang: 'go', weight: 1 },
    { pattern: /\b(rails)\b/g, lang: 'ruby', weight: 2 },
    { pattern: /\b(\.net|dotnet|asp\.net)\b/g, lang: 'csharp', weight: 2 },
    { pattern: /\bios\b/g, lang: 'swift', weight: 1 },
    { pattern: /\bandroid\b/g, lang: 'kotlin', weight: 1 },
    // Infrastructure tools - map to HCL for Terraform, Shell for scripts
    { pattern: /\bterraform\b/g, lang: 'hcl', weight: isInfraRole ? 4 : 1 },
    { pattern: /\bbicep\b/g, lang: 'bicep', weight: isInfraRole ? 4 : 1 },
    { pattern: /\barm\s+templates?\b/g, lang: 'json', weight: isInfraRole ? 3 : 1 },
    { pattern: /\b(ansible|puppet|chef)\b/g, lang: 'python', weight: 2 },
    { pattern: /\b(azure\s+devops|azure-devops)\b/g, lang: 'shell', weight: isInfraRole ? 3 : 1 },
    { pattern: /\b(ci\/cd|cicd|pipeline)\b/g, lang: 'shell', weight: isInfraRole ? 2 : 1 },
  ];

  // Count weighted occurrences of each language
  const languageCounts: Record<string, number> = {};
  for (const { pattern, lang, weight } of languagePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      languageCounts[lang] = (languageCounts[lang] || 0) + (matches.length * weight);
    }
  }

  // Find the most prevalent language
  // For infra roles, default to HCL (Terraform) or Shell instead of Python
  let suggestedLanguage = isInfraRole ? 'hcl' : 'python';
  let maxCount = 0;
  for (const [lang, count] of Object.entries(languageCounts)) {
    if (count > maxCount) {
      maxCount = count;
      suggestedLanguage = lang;
    }
  }

  // Find alternative languages (2nd and 3rd most prevalent)
  const sortedLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
  let alternativeLanguages = sortedLanguages.slice(1, 3);

  // For infra roles, always include shell and python as alternatives if not already present
  if (isInfraRole) {
    const goodInfraLangs = ['shell', 'python', 'powershell', 'go'];
    for (const lang of goodInfraLangs) {
      if (lang !== suggestedLanguage && !alternativeLanguages.includes(lang) && alternativeLanguages.length < 3) {
        alternativeLanguages.push(lang);
      }
    }
  }

  return {
    primaryKeywords: primaryKeywords.slice(0, 8),
    secondaryKeywords: secondaryKeywords.slice(0, 10),
    suggestedLanguage,
    alternativeLanguages,
    reasoning: isInfraRole
      ? 'Infrastructure/Platform role detected - optimized for IaC and scripting languages'
      : 'Generated from job skills (AI unavailable)',
    confidence: isInfraRole ? 0.6 : 0.5,
  };
}

export function resetAIGitHubKeywordGenerator(): void {
  instance = null;
}
