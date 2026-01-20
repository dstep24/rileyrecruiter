/**
 * AI Sourcing Scorer
 *
 * A dedicated Claude-powered agent that evaluates candidates using
 * contextual reasoning for SOURCING purposes (not final hiring).
 *
 * Key insight: Title alone isn't enough - CONTEXT MATTERS!
 * - CTO at 50-person startup ≈ Director scope
 * - CTO at Fortune 500 = 2-3 levels above Director
 * - VP at Series A ≈ Manager scope at enterprise
 *
 * Uses a 4-pillar approach:
 * - Role Fit (30%): Are they doing similar work?
 * - Scope Match (30%): Are they at the right level for this specific opportunity?
 * - Technical Alignment (25%): Do they have the right tech stack/architecture experience?
 * - Location (15%): Can they work here?
 */

import { getClaudeClient, ClaudeClient, ClaudeResponse } from '../../integrations/llm/ClaudeClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CompanyContext {
  headcount: number | null;
  headcountRange: string;
  industry: string | null;
}

export interface CandidateExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  duration?: string; // Pre-formatted duration string
}

export interface CandidateInput {
  id: string;
  name: string;
  currentTitle: string;
  currentCompany: string;
  headline?: string;
  location?: string;
  summary?: string; // The profile "About" section
  experiences?: CandidateExperience[]; // Full work history
  skills?: string[]; // Profile skills
  companyContext?: CompanyContext; // Enriched company data
}

export interface TechnicalRequirements {
  mustHave?: string[];        // Required technologies/skills (e.g., ["TypeScript", "React", "Node.js"])
  niceToHave?: string[];      // Preferred technologies/skills
  architecture?: string[];    // Architecture experience (e.g., ["microservices", "distributed systems", "event-driven"])
  scale?: string;             // Scale context (e.g., "high-traffic", "millions of users", "real-time")
  tools?: string[];           // Specific tools (e.g., ["Kubernetes", "AWS", "Terraform"])
  domain?: string;            // Technical domain (e.g., "backend", "frontend", "full-stack", "ML/AI", "data")
}

export interface RoleInput {
  title: string;
  companySize?: string;
  location: string;
  levelContext?: string;
  industry?: string;
  teamSize?: string;
  technical?: TechnicalRequirements; // Technical requirements for the role
  /** Notes from hiring manager call - takes precedence over JD when there's a conflict */
  intakeNotes?: string;
  /** If true, this is a fully remote role - location scoring should be lenient */
  isFullyRemote?: boolean;
  /** Companies to deprioritize (e.g., big tech for legacy enterprise roles) */
  excludeCompanies?: string[];
  /** Target industries for cultural fit (e.g., fintech, insurance, banking) */
  targetIndustries?: string[];
  /** If true, prioritize candidates with contract/freelance experience */
  isContractRole?: boolean;
  /** Expected contract duration (e.g., "6 months", "12+ months") */
  contractDuration?: string;
}

export interface PillarScore {
  score: number;
  note: string;
}

export interface SourcingScore {
  candidateId: string;
  overallScore: number;
  recommendation: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO';
  reasoning: string;
  pillars: {
    roleFit: PillarScore;
    scopeMatch: PillarScore;
    technicalFit: PillarScore;
    cultureFit: PillarScore; // Industry affinity + company culture match
    location: PillarScore;
  };
  aiPowered: boolean;
  companyEnriched: boolean; // Whether company data was used for scoring
}

export interface BatchSourcingResult {
  scores: SourcingScore[];
  aiPowered: boolean;
  summary: {
    totalCandidates: number;
    strongYes: number;
    yes: number;
    maybe: number;
    no: number;
    avgScore: number;
    processingTimeMs: number;
  };
}

// =============================================================================
// PROMPTS
// =============================================================================

const SOURCING_SYSTEM_PROMPT = `You are a senior technical recruiter evaluating candidates for SOURCING purposes.

Your job is to quickly assess if a candidate is worth reaching out to based on high-level signals.
This is NOT a final hiring decision - it's about identifying promising candidates for initial outreach.

CRITICAL: Consider COMPANY CONTEXT when evaluating seniority/scope:
- A "CTO" at a 50-person startup has similar scope to a "Director" at a 200-person company
- A "VP" at a Series A startup might equal a "Manager" at an enterprise
- FAANG titles are often more senior than they sound
- Startup titles are often more senior than actual scope

CRITICAL: For TECHNICAL ALIGNMENT, use ALL available profile data:
- READ the full work history to understand career progression and technical depth
- USE the About/Summary section - candidates often describe their expertise there
- LOOK for architecture keywords in job descriptions (microservices, distributed, real-time, scale)
- CHECK the skills list for specific technologies
- INFER from company context (fintech = likely Java/Python, startup = likely modern stack)
- Consider company scale as proxy for large-scale system experience

CRITICAL: MUST-HAVE SKILLS REQUIREMENT:
- If Technical Requirements include "Must Have" skills, you MUST explicitly check for each one
- Search: Skills list → About/Summary → Work History descriptions
- In technicalFit note, ALWAYS state: "Found: [skills]" or "Found: X, Y | Missing: Z"
- Consider common equivalents: Go=Golang, React=ReactJS, Node=Node.js, K8s=Kubernetes

CRITICAL: CULTURE & INDUSTRY FIT (when specified):
- If target industries are specified, BOOST candidates with experience in those industries
- If exclude companies are specified, PENALIZE candidates currently at those companies
- Look for "transformation" signals: modernization, migration, legacy-to-modern, technical debt
- Candidates who've done transformation work at similar companies are highly valuable
- Big tech (FAANG) candidates may struggle at legacy enterprise (culture mismatch, comp expectations)
- Candidates from similar industries (insurance→insurance, fintech→fintech) adapt faster

Output valid JSON only - no markdown, no explanation outside the JSON.`;

function buildSourcingPrompt(candidate: CandidateInput, role: RoleInput): string {
  // Build intake notes section if available - HIGHEST PRIORITY
  const intakeNotesSection = role.intakeNotes ? `
## 🔥 INTAKE NOTES FROM HIRING MANAGER (HIGHEST PRIORITY)
These notes come from a live conversation with the hiring manager and OVERRIDE the standard requirements when there's a conflict. Weight these insights heavily:

${role.intakeNotes}

---
` : '';

  // Build fully remote indicator
  const remoteIndicator = role.isFullyRemote
    ? `\n**🌍 FULLY REMOTE ROLE** - Location should NOT affect scoring. Give location a score of 85-95 regardless of where the candidate is located.`
    : '';

  // Build company context section if available
  const companySection = candidate.companyContext
    ? `
### Company Research (from LinkedIn)
- Employee Count: ${candidate.companyContext.headcount || 'Unknown'} (${candidate.companyContext.headcountRange || 'Unknown'})
- Industry: ${candidate.companyContext.industry || 'Unknown'}
USE THIS DATA to accurately assess scope match and infer technical context!`
    : '(No enriched company data - use your best judgment based on company name)';

  // Build technical requirements section
  const tech = role.technical;
  const technicalSection = tech ? `
### Technical Requirements
${tech.mustHave?.length ? `- Must Have: ${tech.mustHave.join(', ')}` : ''}
${tech.niceToHave?.length ? `- Nice to Have: ${tech.niceToHave.join(', ')}` : ''}
${tech.architecture?.length ? `- Architecture: ${tech.architecture.join(', ')}` : ''}
${tech.scale ? `- Scale: ${tech.scale}` : ''}
${tech.tools?.length ? `- Tools: ${tech.tools.join(', ')}` : ''}
${tech.domain ? `- Domain: ${tech.domain}` : ''}` : '';

  // Build culture fit section
  const cultureFitSection = (role.targetIndustries?.length || role.excludeCompanies?.length) ? `
### Company & Culture Fit Criteria
${role.targetIndustries?.length ? `- Target Industries (BOOST): ${role.targetIndustries.join(', ')}
  Candidates with experience in these industries should score HIGHER on culture fit.` : ''}
${role.excludeCompanies?.length ? `- Excluded Companies (PENALIZE): ${role.excludeCompanies.join(', ')}
  Candidates currently at these companies should score LOWER on culture fit.
  They may have unrealistic comp expectations or struggle with legacy enterprise culture.` : ''}
- Look for "transformation" signals: modernization, migration, legacy-to-modern work
- Candidates who've done transformation work in similar industries are HIGHLY valuable` : '';

  // Build contract role section if applicable
  const contractRoleSection = role.isContractRole ? `
### ⚡ CONTRACT ROLE CONSIDERATIONS
**This is a CONTRACT role** (not permanent employment).
${role.contractDuration ? `Expected Duration: ${role.contractDuration}` : ''}

PRIORITIZE candidates with demonstrated contract/freelance experience:
- Look for keywords in titles/descriptions: "contract", "contractor", "freelance", "consultant", "1099", "independent"
- Multiple roles with clear end dates (3-12 month tenures) suggest project-based work
- Job titles containing: "Contractor", "Consultant", "Freelance", "Independent"
- Roles ending mid-year often indicate project-based engagements
- Companies like staffing agencies (Robert Half, TEKsystems, Insight Global, Randstad, etc.) indicate contract work
- Look for patterns: varied industries, multiple short stints, project-based descriptions

CONTRACT EXPERIENCE SCORING BOOST:
- Clear contract history (3+ contract roles): Boost overall score 10-15 points
- Some contract experience (1-2 contract roles): Boost 5-10 points
- No contract indicators but relevant skills: Neutral (still consider)
- Only permanent roles with long tenure (3+ years each): Note lower contract fit` : '';

  // Build experience history section if available
  const experienceSection = candidate.experiences && candidate.experiences.length > 0
    ? `
### Work History
${candidate.experiences.slice(0, 5).map((exp, i) => {
  const duration = exp.duration || (exp.isCurrent ? 'Present' : exp.endDate || 'Past');
  const dateRange = exp.startDate ? `${exp.startDate} - ${duration}` : '';
  const descSnippet = exp.description ? `\n   ${exp.description.slice(0, 200)}${exp.description.length > 200 ? '...' : ''}` : '';
  return `${i + 1}. ${exp.title} at ${exp.company}${dateRange ? ` (${dateRange})` : ''}${descSnippet}`;
}).join('\n')}`
    : '';

  // Build about/summary section if available
  const aboutSection = candidate.summary
    ? `
### About / Summary
${candidate.summary.slice(0, 500)}${candidate.summary.length > 500 ? '...' : ''}`
    : '';

  // Build skills section if available
  const skillsSection = candidate.skills && candidate.skills.length > 0
    ? `
### Skills
${candidate.skills.slice(0, 15).join(', ')}${candidate.skills.length > 15 ? ` (+${candidate.skills.length - 15} more)` : ''}`
    : '';

  return `Evaluate this candidate for sourcing (initial outreach decision).
${intakeNotesSection}
## Role We're Hiring For
Title: ${role.title}
Company Size: ${role.companySize || 'Unknown'}
Location: ${role.isFullyRemote ? 'FULLY REMOTE (location not a factor)' : role.location}${remoteIndicator}
${role.levelContext ? `Level Context: ${role.levelContext}` : ''}
${role.industry ? `Industry: ${role.industry}` : ''}
${role.teamSize ? `Team Size: ${role.teamSize}` : ''}
${technicalSection}
${cultureFitSection}
${contractRoleSection}

## Candidate to Evaluate
Name: ${candidate.name}
Current Title: ${candidate.currentTitle}
Current Company: ${candidate.currentCompany}
${companySection}
${candidate.headline ? `Headline: ${candidate.headline}` : ''}
${candidate.location ? `Location: ${candidate.location}` : ''}
${aboutSection}
${experienceSection}
${skillsSection}

## Your Task
Evaluate if this candidate is worth reaching out to. Consider:
1. Are they doing similar WORK? (role type alignment)
2. Are they at the right SCOPE/LEVEL for this opportunity? (use company size data if available!)
3. Do they have relevant TECHNICAL experience? (tech stack, architecture, scale)
4. Do they have the right CULTURE FIT? (industry background, company type, transformation experience)
5. Can they work in this LOCATION?

## Scoring Guidelines

### Role Fit (0-100) - Weight: 25%
- Are they doing similar work? (engineering leadership vs IC vs sales)
- Don't penalize for different industries
- A "Director of Engineering" and "VP Engineering" do similar work
- MISMATCH: Sales Director for Engineering role

### Scope Match (0-100) - Weight: 25% - USE ACTUAL COMPANY SIZE DATA
- If company headcount is provided, USE IT to assess actual scope:
  * CTO at 50-person company → manages ~10-20 engineers directly
  * CTO at 500-person company → manages via VPs, much larger scope
  * Director at 200-person company → manages ~30-50 engineers
- Without company data, use your best judgment based on company name
- FAANG titles often indicate more seniority than they appear
- Startup titles often indicate less scope than they appear

### Technical Fit (0-100) - Weight: 20%

**CRITICAL: MUST-HAVE SKILL CHECK**
If Must-Have skills are specified in Technical Requirements above, you MUST:
1. Search the candidate's Skills list, About/Summary, and Work History for each must-have
2. In your technicalFit note, explicitly state which must-haves were FOUND vs MISSING
3. Format: "Found: Go, TypeScript | Missing: Kubernetes" or "All must-haves present: Go, Python, AWS"
4. A missing must-have should significantly reduce the technical score (score 50-70 max if some are missing)
5. If ALL must-haves are present, score 75+ if profile data confirms them

**DATA SOURCES TO CHECK (in priority order):**
1. **Skills List**: Most reliable - explicit skill declarations (e.g., "Go" in skills = confirmed)
2. **Work History Descriptions**: Look for technologies used in job descriptions
3. **About/Summary Section**: Candidates often describe their core expertise here
4. **Company Context**: Infer likely stack (fintech=Java/Python, startup=modern stack)

**SCORING LOGIC:**
- All must-haves found in profile → Score 75-100 (mention each one found)
- Most must-haves found → Score 60-75 (list what's found and missing)
- Few/no must-haves found → Score 40-60 (note missing skills, check for equivalents)
- Clear technical mismatch → Score <40 (e.g., sales role for eng position)

**EQUIVALENTS TO CONSIDER:**
- "Golang" = "Go" (same language)
- "React.js" = "React" = "ReactJS"
- "Node" = "Node.js" = "NodeJS"
- "K8s" = "Kubernetes"
- "Postgres" = "PostgreSQL"
- "GCP" = "Google Cloud Platform"

### Culture Fit (0-100) - Weight: 15%
- BOOST if candidate has experience in TARGET INDUSTRIES (if specified)
- PENALIZE if candidate is currently at an EXCLUDED COMPANY (if specified)
- Look for "transformation" signals in work history:
  * Modernization projects, tech migration, legacy system updates
  * Moving from monolith to microservices
  * Cloud migration experience
  * Technical debt reduction
- Candidates from similar company types adapt faster:
  * Enterprise → Enterprise is easier than Startup → Enterprise
  * Fintech → Fintech, Healthcare → Healthcare, etc.
- FAANG/big tech candidates may struggle at legacy enterprise (culture/comp mismatch)
${role.isContractRole ? `
**CONTRACT FIT (for contract roles):**
- PRIORITIZE candidates showing contract/freelance work patterns in their history
- Look for adaptability signals: multiple industries, varied project types, quick ramp-up evidence
- Contractors who hit the ground running are valuable - look for evidence of fast onboarding
- Multiple short tenures (6-12 months) is a POSITIVE signal for contract roles
- Titles with "Contractor", "Consultant", "Freelance" are strong indicators
- BOOST score 10-15 points for clear contract history` : ''}

### Location (0-100) - Weight: 15%
- Same city = 100
- Same metro/region = 80-90
- Remote-friendly or willing to relocate = 60-70
- Different region, no remote indication = 30-50

## Output Format (JSON only)

IMPORTANT - Pillar Notes Style:
- When qualification is DEMONSTRATED (high confidence): Reference the specific company/role
  Example: "Director at Stripe (500+ eng)" or "Led platform team at Airbnb"
- When qualification is SIGNALED (medium confidence): Use signal language
  Example: "Title suggests leadership scope" or "Headline indicates React experience"
- When qualification is INFERRED (low confidence): Be clear about inference
  Example: "Fintech background suggests security focus" or "Startup likely uses modern stack"

**CRITICAL FOR technicalFit NOTE:**
- If must-have skills were specified, your note MUST list which were found vs missing
- Format: "Found: [list] | Missing: [list]" or "All must-haves present: [list]"
- Include WHERE you found them: "Go (skills), TypeScript (work history at PayPal)"

{
  "overallScore": <0-100>,
  "recommendation": "<STRONG_YES|YES|MAYBE|NO>",
  "reasoning": "<1-2 sentence explanation of your assessment>",
  "pillars": {
    "roleFit": { "score": <0-100>, "note": "<reference company/title if demonstrated, otherwise describe signal>" },
    "scopeMatch": { "score": <0-100>, "note": "<reference company size/team if known, otherwise describe inference>" },
    "technicalFit": { "score": <0-100>, "note": "<MUST list found/missing must-haves with source locations>" },
    "cultureFit": { "score": <0-100>, "note": "<industry match, excluded company check, transformation signals>" },
    "location": { "score": <0-100>, "note": "<state match type: exact city, same metro, or remote possibility>" }
  }
}

Recommendation guidelines:
- STRONG_YES: Score >= 80, clear alignment, prioritize outreach
- YES: Score 60-79, good potential, worth reaching out
- MAYBE: Score 40-59, possible fit, review manually
- NO: Score < 40, likely not a fit for this role`;
}

// =============================================================================
// AI SOURCING SCORER CLASS
// =============================================================================

export class AISourcingScorer {
  private claudeClient: ClaudeClient | null = null;
  private isAIAvailable: boolean = false;

  constructor() {
    try {
      this.claudeClient = getClaudeClient();
      this.isAIAvailable = true;
    } catch {
      // No API key configured - will use fallback
      this.isAIAvailable = false;
      console.log('AISourcingScorer: No Anthropic API key, using heuristic fallback');
    }
  }

  /**
   * Score a single candidate using AI reasoning
   */
  async scoreCandidate(
    candidate: CandidateInput,
    role: RoleInput
  ): Promise<SourcingScore> {
    if (!this.isAIAvailable || !this.claudeClient) {
      return this.fallbackScore(candidate, role);
    }

    try {
      const prompt = buildSourcingPrompt(candidate, role);

      // Debug: Log whether full profile data is being used
      const hasFullProfile = !!(candidate.experiences?.length || candidate.summary || candidate.skills?.length);
      if (hasFullProfile) {
        console.log(`[AISourcingScorer] Candidate ${candidate.name}: scoring with full profile (${candidate.experiences?.length || 0} experiences, summary: ${candidate.summary ? 'yes' : 'no'}, ${candidate.skills?.length || 0} skills)`);
      }

      const response = await this.claudeClient.chat({
        systemPrompt: SOURCING_SYSTEM_PROMPT,
        prompt,
        temperature: 0.3, // Low for consistency
        maxTokens: 500,   // Keep responses concise
      });

      return this.parseResponse(response, candidate.id, !!candidate.companyContext);
    } catch (error) {
      console.error(`Error scoring candidate ${candidate.id}:`, error);
      return this.fallbackScore(candidate, role);
    }
  }

  /**
   * Score multiple candidates in parallel batches
   */
  async scoreBatch(
    candidates: CandidateInput[],
    role: RoleInput,
    options: { batchSize?: number } = {}
  ): Promise<BatchSourcingResult> {
    const { batchSize = 5 } = options;
    const startTime = Date.now();
    const scores: SourcingScore[] = [];

    // Process in batches for parallelism
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchPromises = batch.map((candidate) =>
        this.scoreCandidate(candidate, role)
      );

      const batchResults = await Promise.all(batchPromises);
      scores.push(...batchResults);
    }

    // Sort by overall score descending
    scores.sort((a, b) => b.overallScore - a.overallScore);

    // Calculate summary statistics
    const strongYes = scores.filter((s) => s.recommendation === 'STRONG_YES').length;
    const yes = scores.filter((s) => s.recommendation === 'YES').length;
    const maybe = scores.filter((s) => s.recommendation === 'MAYBE').length;
    const no = scores.filter((s) => s.recommendation === 'NO').length;
    const avgScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
      : 0;

    return {
      scores,
      aiPowered: this.isAIAvailable,
      summary: {
        totalCandidates: candidates.length,
        strongYes,
        yes,
        maybe,
        no,
        avgScore: Math.round(avgScore * 10) / 10,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Check if AI scoring is available
   */
  isAIPowered(): boolean {
    return this.isAIAvailable;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private parseResponse(response: ClaudeResponse, candidateId: string, companyEnriched: boolean = false): SourcingScore {
    try {
      const parsed = this.claudeClient!.parseJsonResponse<{
        overallScore: number;
        recommendation: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO';
        reasoning: string;
        pillars: {
          roleFit: PillarScore;
          scopeMatch: PillarScore;
          technicalFit: PillarScore;
          cultureFit?: PillarScore;
          location: PillarScore;
        };
      }>(response);

      // Validate and clamp score
      const overallScore = Math.max(0, Math.min(100, parsed.overallScore || 0));

      // Ensure cultureFit pillar exists (may be missing from older AI responses)
      const pillars = parsed.pillars ? {
        ...parsed.pillars,
        cultureFit: parsed.pillars.cultureFit || { score: 60, note: 'Not evaluated' },
      } : this.createEmptyPillars();

      return {
        candidateId,
        overallScore,
        recommendation: parsed.recommendation || this.scoreToRecommendation(overallScore),
        reasoning: parsed.reasoning || 'No reasoning provided',
        pillars,
        aiPowered: true,
        companyEnriched,
      };
    } catch (error) {
      console.error('Failed to parse AI scoring response:', error);
      console.error('Raw response:', response.content);
      return {
        candidateId,
        overallScore: 50,
        recommendation: 'MAYBE',
        reasoning: 'Failed to parse AI response, using default score',
        pillars: this.createEmptyPillars(),
        aiPowered: false,
        companyEnriched: false,
      };
    }
  }

  /**
   * Fallback scoring when AI is unavailable
   * Uses simple heuristics based on title/location/skills matching
   */
  private fallbackScore(candidate: CandidateInput, role: RoleInput): SourcingScore {
    // Role fit: Simple keyword matching on title - reference company if match is strong
    const roleFitScore = this.calculateTitleMatch(candidate.currentTitle, role.title);
    const roleFitNote = roleFitScore >= 70
      ? `${candidate.currentTitle} at ${candidate.currentCompany}`
      : roleFitScore >= 40
        ? `Title "${candidate.currentTitle}" signals related role`
        : `Title "${candidate.currentTitle}" may not align`;

    // Scope match: Reference company context if available
    const scopeMatchScore = candidate.companyContext?.headcount ? 60 : 50;
    const scopeMatchNote = candidate.companyContext?.headcount
      ? `${candidate.currentTitle} at ${candidate.companyContext.headcountRange || 'unknown size'} company`
      : `Scope at ${candidate.currentCompany} requires AI to assess`;

    // Technical fit: Simple keyword matching on headline - mention specific matches
    const technicalFitScore = this.calculateTechnicalMatch(candidate.headline, role.technical);
    const technicalFitNote = technicalFitScore >= 70
      ? `Tech signals in headline: "${candidate.headline?.substring(0, 50)}..."`
      : technicalFitScore >= 50
        ? `Some alignment possible based on ${candidate.currentCompany} context`
        : 'Technical fit requires AI to assess';

    // Location: Simple string matching - be specific about match type
    const locationScore = this.calculateLocationMatch(candidate.location, role.location);
    const locationNote = locationScore >= 90
      ? `Exact match: ${candidate.location}`
      : locationScore >= 70
        ? `Same region: ${candidate.location}`
      : locationScore >= 50
        ? `${candidate.location} - may work remotely`
        : `${candidate.location || 'Unknown'} - different region`;

    // Culture fit: Check for industry alignment and excluded companies
    let cultureFitScore = 60; // Default neutral score
    let cultureFitNote = 'Culture fit requires AI to assess';

    if (role.excludeCompanies?.length) {
      const excludedLower = role.excludeCompanies.map(c => c.toLowerCase());
      const currentCompanyLower = candidate.currentCompany?.toLowerCase() || '';
      if (excludedLower.some(exc => currentCompanyLower.includes(exc))) {
        cultureFitScore = 30;
        cultureFitNote = `Currently at excluded company: ${candidate.currentCompany}`;
      }
    }

    if (role.targetIndustries?.length && candidate.companyContext?.industry) {
      const industryLower = candidate.companyContext.industry.toLowerCase();
      const targetLower = role.targetIndustries.map(i => i.toLowerCase());
      if (targetLower.some(t => industryLower.includes(t))) {
        cultureFitScore = Math.min(90, cultureFitScore + 30);
        cultureFitNote = `Industry match: ${candidate.companyContext.industry}`;
      }
    }

    // Calculate overall score with weights: 25% role, 25% scope, 20% technical, 15% culture, 15% location
    const overallScore = Math.round(
      roleFitScore * 0.25 +
      scopeMatchScore * 0.25 +
      technicalFitScore * 0.20 +
      cultureFitScore * 0.15 +
      locationScore * 0.15
    );

    return {
      candidateId: candidate.id,
      overallScore,
      recommendation: this.scoreToRecommendation(overallScore),
      reasoning: 'Scored using keyword matching (AI unavailable)',
      pillars: {
        roleFit: { score: roleFitScore, note: roleFitNote },
        scopeMatch: { score: scopeMatchScore, note: scopeMatchNote },
        technicalFit: { score: technicalFitScore, note: technicalFitNote },
        cultureFit: { score: cultureFitScore, note: cultureFitNote },
        location: { score: locationScore, note: locationNote },
      },
      aiPowered: false,
      companyEnriched: false,
    };
  }

  private calculateTechnicalMatch(headline?: string, technical?: TechnicalRequirements): number {
    if (!headline || !technical) return 50; // Default when no data

    const headlineLower = headline.toLowerCase();

    // Collect all technical keywords to search for
    const allKeywords = [
      ...(technical.mustHave || []),
      ...(technical.niceToHave || []),
      ...(technical.architecture || []),
      ...(technical.tools || []),
    ].map(k => k.toLowerCase());

    if (allKeywords.length === 0) return 50; // No requirements specified

    // Count matches
    let matches = 0;
    let mustHaveMatches = 0;
    const mustHaveCount = technical.mustHave?.length || 0;

    for (const keyword of allKeywords) {
      // Handle multi-word keywords and common variations
      const variations = [
        keyword,
        keyword.replace(/\s+/g, ''),  // "type script" -> "typescript"
        keyword.replace(/-/g, ''),     // "node-js" -> "nodejs"
      ];

      if (variations.some(v => headlineLower.includes(v))) {
        matches++;
        if (technical.mustHave?.map(k => k.toLowerCase()).includes(keyword)) {
          mustHaveMatches++;
        }
      }
    }

    // Calculate score
    const matchRatio = matches / allKeywords.length;
    const mustHaveRatio = mustHaveCount > 0 ? mustHaveMatches / mustHaveCount : 1;

    // Weight must-have skills more heavily
    const score = Math.round((matchRatio * 0.4 + mustHaveRatio * 0.6) * 100);

    // Clamp between 30-100 (don't penalize too heavily for missing keywords in brief headlines)
    return Math.max(30, Math.min(100, score + 30));
  }

  private calculateTitleMatch(candidateTitle: string, roleTitle: string): number {
    if (!candidateTitle || !roleTitle) return 30;

    const candidateLower = candidateTitle.toLowerCase();
    const roleLower = roleTitle.toLowerCase();

    // Extract key words
    const candidateWords = candidateLower.split(/\s+/).filter(w => w.length > 2);
    const roleWords = roleLower.split(/\s+/).filter(w => w.length > 2);

    // Check for exact title match
    if (candidateLower === roleLower) return 100;

    // Check for key word overlap
    const matchingWords = candidateWords.filter(cw =>
      roleWords.some(rw => cw.includes(rw) || rw.includes(cw))
    );

    // Calculate match percentage
    const overlapRatio = matchingWords.length / Math.max(roleWords.length, 1);

    // Check for level indicators
    const levelMap: Record<string, number> = {
      'cto': 100,
      'ceo': 100,
      'vp': 90,
      'vice president': 90,
      'director': 80,
      'head of': 80,
      'senior manager': 70,
      'manager': 60,
      'lead': 55,
      'principal': 55,
      'senior': 50,
      'staff': 50,
    };

    // Check if role level matches
    let levelBonus = 0;
    for (const [level, score] of Object.entries(levelMap)) {
      if (roleLower.includes(level) && candidateLower.includes(level)) {
        levelBonus = 20;
        break;
      }
    }

    return Math.min(100, Math.round(overlapRatio * 60 + levelBonus + 20));
  }

  private calculateLocationMatch(candidateLocation?: string, roleLocation?: string): number {
    if (!candidateLocation || !roleLocation) return 50;

    const candidateLower = candidateLocation.toLowerCase();
    const roleLower = roleLocation.toLowerCase();

    // Exact match
    if (candidateLower === roleLower) return 100;

    // Check for city/state overlap
    const candidateParts = candidateLower.split(/[,\s]+/).filter(p => p.length > 1);
    const roleParts = roleLower.split(/[,\s]+/).filter(p => p.length > 1);

    const matchingParts = candidateParts.filter(cp =>
      roleParts.some(rp => cp.includes(rp) || rp.includes(cp))
    );

    if (matchingParts.length > 0) {
      return Math.min(90, 60 + matchingParts.length * 15);
    }

    // No match
    return 30;
  }

  private scoreToRecommendation(score: number): 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO' {
    if (score >= 80) return 'STRONG_YES';
    if (score >= 60) return 'YES';
    if (score >= 40) return 'MAYBE';
    return 'NO';
  }

  private createEmptyPillars(): SourcingScore['pillars'] {
    return {
      roleFit: { score: 50, note: 'Unable to evaluate' },
      scopeMatch: { score: 50, note: 'Unable to evaluate' },
      technicalFit: { score: 50, note: 'Unable to evaluate' },
      cultureFit: { score: 50, note: 'Unable to evaluate' },
      location: { score: 50, note: 'Unable to evaluate' },
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let scorerInstance: AISourcingScorer | null = null;

export function getAISourcingScorer(): AISourcingScorer {
  if (!scorerInstance) {
    scorerInstance = new AISourcingScorer();
  }
  return scorerInstance;
}

export function resetAISourcingScorer(): void {
  scorerInstance = null;
}
