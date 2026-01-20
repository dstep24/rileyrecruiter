/**
 * AI Candidate Scorer
 *
 * Uses Claude to score candidates against role requirements using AI reasoning.
 * This solves the problem of unqualified candidates (e.g., 3-year programmers)
 * appearing in searches for senior roles (e.g., Director of Engineering).
 *
 * Key scoring dimensions:
 * - Seniority Match: Career progression appropriate for the level
 * - Technical Fit: Required skills and experience depth
 * - Career Trajectory: Growth pattern over time
 * - Leadership Evidence: Management experience signals
 * - Location Match: Geographic fit
 */

import { getClaudeClient, ClaudeClient, ClaudeResponse } from '../../integrations/llm/ClaudeClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CandidateProfile {
  id: string;
  name: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  profileUrl?: string;
  experience: CandidateExperience[];
  skills: string[];
  education?: CandidateEducation[];
  summary?: string;
}

export interface CandidateExperience {
  title: string;
  company: string;
  duration: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  location?: string;
}

export interface CandidateEducation {
  school: string;
  degree?: string;
  field?: string;
  year?: string;
}

export interface RoleRequirements {
  title: string;
  seniorityLevel: SeniorityLevel;
  minYearsExperience: number;
  minYearsAtLevel?: number;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  targetLocation?: string;
  remoteOk?: boolean;
  description?: string;
  leadershipRequired?: boolean;
  teamSizeExpected?: string;
}

export type SeniorityLevel = 'IC' | 'Lead' | 'Manager' | 'Senior Manager' | 'Director' | 'VP' | 'C-Level';

export interface CandidateScore {
  candidateId: string;
  overallScore: number; // 0-100

  dimensions: {
    seniorityMatch: DimensionScore;
    technicalFit: DimensionScore;
    careerTrajectory: DimensionScore;
    leadershipEvidence: DimensionScore;
    locationMatch: DimensionScore;
  };

  recommendation: Recommendation;

  highlights: string[];   // Top reasons to pursue this candidate
  concerns: string[];     // Potential issues to explore

  suggestedApproach?: string; // How to pitch the role to this candidate

  metadata: {
    scoredAt: Date;
    modelUsed: string;
    latencyMs: number;
    tokensUsed: number;
  };
}

export interface DimensionScore {
  score: number;      // 0-100
  weight: number;     // 0-1
  reasoning: string;
  evidence: string[];
}

export type Recommendation = 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO' | 'STRONG_NO';

export interface BatchScoringResult {
  scores: CandidateScore[];
  summary: {
    totalCandidates: number;
    qualified: number;        // score >= 70
    borderline: number;       // 50-69
    unqualified: number;      // < 50
    avgScore: number;
    processingTimeMs: number;
    totalTokensUsed: number;
  };
}

// =============================================================================
// PROMPTS
// =============================================================================

const CANDIDATE_SCORING_SYSTEM_PROMPT = `You are an expert technical recruiter evaluating candidates for job positions.

Your job is to score candidates accurately and objectively, identifying those who truly match the role requirements while filtering out unqualified candidates.

CRITICAL: Be rigorous about seniority matching. A "Director of Engineering" role requires actual leadership experience - not just senior IC work. Key signals:
- IC roles: "Engineer", "Developer", "Architect" (individual work)
- Lead roles: "Tech Lead", "Team Lead" (small team, technical focus)
- Manager roles: "Engineering Manager" (people management, usually 5-15 people)
- Director roles: "Director", "Head of" (multiple teams, strategy, 20+ people)
- VP roles: "VP", "Vice President" (org-wide impact, executive function)
- C-Level: "CTO", "CEO" (company-wide responsibility)

Experience years matter, but seniority signals matter MORE. A 15-year IC is NOT qualified for a Director role without management experience.

Output your evaluation as valid JSON only - no markdown, no explanation outside the JSON.`;

function buildScoringPrompt(candidate: CandidateProfile, requirements: RoleRequirements): string {
  return `Evaluate this candidate for the ${requirements.title} position.

## Role Requirements
- Title: ${requirements.title}
- Seniority Level: ${requirements.seniorityLevel}
- Min Total Experience: ${requirements.minYearsExperience} years
${requirements.minYearsAtLevel ? `- Min Years at This Level: ${requirements.minYearsAtLevel} years` : ''}
- Must-Have Skills: ${requirements.mustHaveSkills.join(', ')}
- Nice-to-Have Skills: ${requirements.niceToHaveSkills.join(', ')}
- Target Location: ${requirements.targetLocation || 'Any'}
${requirements.remoteOk ? '- Remote OK: Yes' : ''}
${requirements.leadershipRequired ? '- Leadership Required: Yes' : ''}
${requirements.teamSizeExpected ? `- Expected Team Size: ${requirements.teamSizeExpected}` : ''}
${requirements.description ? `\nRole Description:\n${requirements.description}` : ''}

## Candidate Profile
- Name: ${candidate.name}
- Headline: ${candidate.headline || 'N/A'}
- Current: ${candidate.currentTitle || 'Unknown'} at ${candidate.currentCompany || 'Unknown'}
- Location: ${candidate.location || 'Unknown'}

### Experience History
${candidate.experience.map((exp, i) => `
${i + 1}. ${exp.title} at ${exp.company} (${exp.duration})
   ${exp.location ? `Location: ${exp.location}` : ''}
   ${exp.description ? `Description: ${exp.description}` : ''}
`).join('')}

### Skills
${candidate.skills.join(', ')}

${candidate.education && candidate.education.length > 0 ? `### Education
${candidate.education.map(edu => `- ${edu.degree || 'Degree'} in ${edu.field || 'Field'} from ${edu.school}${edu.year ? ` (${edu.year})` : ''}`).join('\n')}` : ''}

${candidate.summary ? `### Summary\n${candidate.summary}` : ''}

## Scoring Instructions

Score each dimension from 0-100:

1. **Seniority Match** (Weight: 0.30)
   - Does their career show they're ready for ${requirements.seniorityLevel} level?
   - Have they held similar responsibility before?
   - RED FLAG: Only IC experience when seeking ${requirements.seniorityLevel}

2. **Technical Fit** (Weight: 0.25)
   - Do they have the must-have skills: ${requirements.mustHaveSkills.join(', ')}?
   - Evidence of deep experience vs just keywords?
   - RED FLAG: Missing critical skills

3. **Career Trajectory** (Weight: 0.20)
   - Are they growing in responsibility over time?
   - Pattern: IC → Lead → Manager → Director → VP?
   - RED FLAG: Flat career, no progression

4. **Leadership Evidence** (Weight: 0.15)
   - Evidence of managing people/teams?
   - Look for: "Led team of X", "Managed", "Built", "Scaled"
   - RED FLAG: No leadership signals for leadership role

5. **Location Match** (Weight: 0.10)
   - Are they in/near ${requirements.targetLocation || 'target location'}?
   - History of relocation?
   ${requirements.remoteOk ? '- Remote is acceptable' : ''}

## Output Format (JSON only)

{
  "overallScore": <0-100>,
  "dimensions": {
    "seniorityMatch": {
      "score": <0-100>,
      "weight": 0.30,
      "reasoning": "<brief explanation>",
      "evidence": ["<specific evidence from profile>"]
    },
    "technicalFit": {
      "score": <0-100>,
      "weight": 0.25,
      "reasoning": "<brief explanation>",
      "evidence": ["<specific evidence>"]
    },
    "careerTrajectory": {
      "score": <0-100>,
      "weight": 0.20,
      "reasoning": "<brief explanation>",
      "evidence": ["<specific evidence>"]
    },
    "leadershipEvidence": {
      "score": <0-100>,
      "weight": 0.15,
      "reasoning": "<brief explanation>",
      "evidence": ["<specific evidence>"]
    },
    "locationMatch": {
      "score": <0-100>,
      "weight": 0.10,
      "reasoning": "<brief explanation>",
      "evidence": ["<specific evidence>"]
    }
  },
  "recommendation": "<STRONG_YES|YES|MAYBE|NO|STRONG_NO>",
  "highlights": ["<reason 1>", "<reason 2>", "<reason 3>"],
  "concerns": ["<concern 1>", "<concern 2>"],
  "suggestedApproach": "<how to pitch this role to them>"
}

Recommendation guidelines:
- STRONG_YES: Score >= 85, clear match, pursue immediately
- YES: Score 70-84, good fit, worth pursuing
- MAYBE: Score 55-69, potential fit, needs more evaluation
- NO: Score 40-54, weak fit, likely not qualified
- STRONG_NO: Score < 40, clearly unqualified, do not pursue`;
}

// =============================================================================
// AI CANDIDATE SCORER CLASS
// =============================================================================

export class AICandidateScorer {
  private claudeClient: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient || getClaudeClient();
  }

  /**
   * Score a single candidate against role requirements
   */
  async scoreCandidate(
    candidate: CandidateProfile,
    requirements: RoleRequirements
  ): Promise<CandidateScore> {
    const prompt = buildScoringPrompt(candidate, requirements);

    const response = await this.claudeClient.chat({
      systemPrompt: CANDIDATE_SCORING_SYSTEM_PROMPT,
      prompt,
      temperature: 0.2, // Low temperature for consistent scoring
      maxTokens: 2048,
    });

    const parsed = this.parseScoreResponse(response, candidate.id);

    return {
      ...parsed,
      metadata: {
        scoredAt: new Date(),
        modelUsed: response.model,
        latencyMs: response.latencyMs,
        tokensUsed: response.usage.totalTokens,
      },
    };
  }

  /**
   * Score multiple candidates in parallel batches
   */
  async scoreCandidates(
    candidates: CandidateProfile[],
    requirements: RoleRequirements,
    options: { batchSize?: number; minScore?: number } = {}
  ): Promise<BatchScoringResult> {
    const { batchSize = 5, minScore = 0 } = options;
    const startTime = Date.now();
    const scores: CandidateScore[] = [];
    let totalTokens = 0;

    // Process in batches for parallelism
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchPromises = batch.map((candidate) =>
        this.scoreCandidate(candidate, requirements).catch((error) => {
          console.error(`Error scoring candidate ${candidate.id}:`, error);
          return this.createErrorScore(candidate.id, error);
        })
      );

      const batchResults = await Promise.all(batchPromises);
      for (const score of batchResults) {
        totalTokens += score.metadata.tokensUsed;
        if (score.overallScore >= minScore) {
          scores.push(score);
        }
      }
    }

    // Sort by overall score descending
    scores.sort((a, b) => b.overallScore - a.overallScore);

    // Calculate summary statistics
    const qualified = scores.filter((s) => s.overallScore >= 70).length;
    const borderline = scores.filter((s) => s.overallScore >= 50 && s.overallScore < 70).length;
    const unqualified = scores.filter((s) => s.overallScore < 50).length;
    const avgScore = scores.length > 0
      ? scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length
      : 0;

    return {
      scores,
      summary: {
        totalCandidates: candidates.length,
        qualified,
        borderline,
        unqualified,
        avgScore: Math.round(avgScore * 10) / 10,
        processingTimeMs: Date.now() - startTime,
        totalTokensUsed: totalTokens,
      },
    };
  }

  /**
   * Quick filter to identify obviously unqualified candidates
   * Uses a faster, cheaper check before full scoring
   */
  async quickFilter(
    candidates: CandidateProfile[],
    requirements: RoleRequirements
  ): Promise<{ qualified: CandidateProfile[]; filtered: CandidateProfile[] }> {
    const qualified: CandidateProfile[] = [];
    const filtered: CandidateProfile[] = [];

    for (const candidate of candidates) {
      // Quick heuristic checks
      const totalYears = this.estimateTotalYears(candidate.experience);
      const hasLeadershipTitle = this.hasLeadershipTitle(candidate);
      const hasRequiredSkills = this.hasMinimumSkills(candidate, requirements.mustHaveSkills);

      // Apply quick filters based on role level
      if (requirements.seniorityLevel === 'Director' || requirements.seniorityLevel === 'VP') {
        // Director/VP roles require leadership experience
        if (totalYears < 8 || !hasLeadershipTitle) {
          filtered.push(candidate);
          continue;
        }
      } else if (requirements.seniorityLevel === 'Manager' || requirements.seniorityLevel === 'Senior Manager') {
        if (totalYears < 5) {
          filtered.push(candidate);
          continue;
        }
      }

      // Check minimum skill overlap
      if (!hasRequiredSkills) {
        filtered.push(candidate);
        continue;
      }

      qualified.push(candidate);
    }

    return { qualified, filtered };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private parseScoreResponse(response: ClaudeResponse, candidateId: string): Omit<CandidateScore, 'metadata'> {
    try {
      const parsed = this.claudeClient.parseJsonResponse<{
        overallScore: number;
        dimensions: CandidateScore['dimensions'];
        recommendation: Recommendation;
        highlights: string[];
        concerns: string[];
        suggestedApproach?: string;
      }>(response);

      // Validate and clamp scores
      const overallScore = Math.max(0, Math.min(100, parsed.overallScore || 0));

      return {
        candidateId,
        overallScore,
        dimensions: parsed.dimensions || this.createEmptyDimensions(),
        recommendation: parsed.recommendation || this.scoreToRecommendation(overallScore),
        highlights: parsed.highlights || [],
        concerns: parsed.concerns || [],
        suggestedApproach: parsed.suggestedApproach,
      };
    } catch (error) {
      console.error('Failed to parse scoring response:', error);
      console.error('Raw response:', response.content);
      return this.createErrorScore(candidateId, error).dimensions
        ? (this.createErrorScore(candidateId, error) as Omit<CandidateScore, 'metadata'>)
        : {
            candidateId,
            overallScore: 0,
            dimensions: this.createEmptyDimensions(),
            recommendation: 'NO',
            highlights: [],
            concerns: ['Failed to parse AI scoring response'],
          };
    }
  }

  private createEmptyDimensions(): CandidateScore['dimensions'] {
    const emptyDimension: DimensionScore = {
      score: 0,
      weight: 0.2,
      reasoning: 'Unable to evaluate',
      evidence: [],
    };
    return {
      seniorityMatch: { ...emptyDimension, weight: 0.30 },
      technicalFit: { ...emptyDimension, weight: 0.25 },
      careerTrajectory: { ...emptyDimension, weight: 0.20 },
      leadershipEvidence: { ...emptyDimension, weight: 0.15 },
      locationMatch: { ...emptyDimension, weight: 0.10 },
    };
  }

  private createErrorScore(candidateId: string, error: unknown): CandidateScore {
    return {
      candidateId,
      overallScore: 0,
      dimensions: this.createEmptyDimensions(),
      recommendation: 'NO',
      highlights: [],
      concerns: [`Scoring error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      metadata: {
        scoredAt: new Date(),
        modelUsed: 'error',
        latencyMs: 0,
        tokensUsed: 0,
      },
    };
  }

  private scoreToRecommendation(score: number): Recommendation {
    if (score >= 85) return 'STRONG_YES';
    if (score >= 70) return 'YES';
    if (score >= 55) return 'MAYBE';
    if (score >= 40) return 'NO';
    return 'STRONG_NO';
  }

  private estimateTotalYears(experience: CandidateExperience[]): number {
    let totalMonths = 0;
    for (const exp of experience) {
      // Parse duration like "2 years 3 months" or "2yr 3mo"
      const yearMatch = exp.duration.match(/(\d+)\s*(?:year|yr)/i);
      const monthMatch = exp.duration.match(/(\d+)\s*(?:month|mo)/i);
      if (yearMatch) totalMonths += parseInt(yearMatch[1]) * 12;
      if (monthMatch) totalMonths += parseInt(monthMatch[1]);
    }
    return Math.round(totalMonths / 12);
  }

  private hasLeadershipTitle(candidate: CandidateProfile): boolean {
    const leadershipPatterns = [
      /director/i,
      /head of/i,
      /vp\b/i,
      /vice president/i,
      /chief/i,
      /manager/i,
      /lead/i,
      /principal/i,
    ];

    const allTitles = [
      candidate.currentTitle,
      candidate.headline,
      ...candidate.experience.map((e) => e.title),
    ].filter(Boolean) as string[];

    return allTitles.some((title) =>
      leadershipPatterns.some((pattern) => pattern.test(title))
    );
  }

  private hasMinimumSkills(candidate: CandidateProfile, requiredSkills: string[]): boolean {
    if (requiredSkills.length === 0) return true;
    const candidateSkillsLower = candidate.skills.map((s) => s.toLowerCase());
    const matchCount = requiredSkills.filter((skill) =>
      candidateSkillsLower.some((cs) => cs.includes(skill.toLowerCase()) || skill.toLowerCase().includes(cs))
    ).length;
    // Require at least 25% skill overlap
    return matchCount >= Math.ceil(requiredSkills.length * 0.25);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let scorerInstance: AICandidateScorer | null = null;

export function getAICandidateScorer(): AICandidateScorer {
  if (!scorerInstance) {
    scorerInstance = new AICandidateScorer();
  }
  return scorerInstance;
}

export function resetAICandidateScorer(): void {
  scorerInstance = null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert Unipile profile format to CandidateProfile format
 */
export function unipileProfileToCandidateProfile(
  profile: {
    id?: string;
    provider_id?: string;
    first_name?: string;
    last_name?: string;
    headline?: string;
    occupation?: string;
    public_identifier?: string;
    location?: string;
    experiences?: Array<{
      title?: string;
      company_name?: string;
      duration?: string;
      description?: string;
      location?: string;
    }>;
    skills?: string[];
    educations?: Array<{
      school_name?: string;
      degree_name?: string;
      field_of_study?: string;
      end_date?: string;
    }>;
    summary?: string;
  }
): CandidateProfile {
  return {
    id: profile.id || profile.provider_id || profile.public_identifier || 'unknown',
    name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
    headline: profile.headline || profile.occupation,
    currentTitle: profile.experiences?.[0]?.title,
    currentCompany: profile.experiences?.[0]?.company_name,
    location: profile.location,
    profileUrl: profile.public_identifier
      ? `https://linkedin.com/in/${profile.public_identifier}`
      : undefined,
    experience: (profile.experiences || []).map((exp) => ({
      title: exp.title || 'Unknown Title',
      company: exp.company_name || 'Unknown Company',
      duration: exp.duration || 'Unknown Duration',
      description: exp.description,
      location: exp.location,
    })),
    skills: profile.skills || [],
    education: (profile.educations || []).map((edu) => ({
      school: edu.school_name || 'Unknown School',
      degree: edu.degree_name,
      field: edu.field_of_study,
      year: edu.end_date,
    })),
    summary: profile.summary,
  };
}

/**
 * Derive role requirements from parsed job criteria
 */
export function deriveRoleRequirements(
  parsedCriteria: {
    titles?: string[];
    requiredSkills?: string[];
    preferredSkills?: string[];
    locations?: string[];
    experienceYears?: { min: number; max: number };
    seniorityLevel?: string;
  },
  jobTitle: string,
  jobDescription?: string
): RoleRequirements {
  // Infer seniority level from title if not provided
  let seniorityLevel: SeniorityLevel = 'IC';
  const titleLower = jobTitle.toLowerCase();

  if (/\b(cto|ceo|cfo|coo|chief)\b/.test(titleLower)) {
    seniorityLevel = 'C-Level';
  } else if (/\b(vp|vice president)\b/.test(titleLower)) {
    seniorityLevel = 'VP';
  } else if (/\bdirector\b/.test(titleLower) || /\bhead of\b/.test(titleLower)) {
    seniorityLevel = 'Director';
  } else if (/\bsenior manager\b/.test(titleLower)) {
    seniorityLevel = 'Senior Manager';
  } else if (/\bmanager\b/.test(titleLower)) {
    seniorityLevel = 'Manager';
  } else if (/\b(lead|principal|staff)\b/.test(titleLower)) {
    seniorityLevel = 'Lead';
  }

  // Infer minimum years based on seniority
  let minYearsExperience = parsedCriteria.experienceYears?.min || 0;
  if (minYearsExperience === 0) {
    switch (seniorityLevel) {
      case 'C-Level': minYearsExperience = 15; break;
      case 'VP': minYearsExperience = 12; break;
      case 'Director': minYearsExperience = 10; break;
      case 'Senior Manager': minYearsExperience = 8; break;
      case 'Manager': minYearsExperience = 5; break;
      case 'Lead': minYearsExperience = 5; break;
      default: minYearsExperience = 3;
    }
  }

  // Leadership required for Manager+ roles
  const leadershipRequired = ['Manager', 'Senior Manager', 'Director', 'VP', 'C-Level'].includes(seniorityLevel);

  return {
    title: jobTitle,
    seniorityLevel,
    minYearsExperience,
    minYearsAtLevel: leadershipRequired ? Math.floor(minYearsExperience / 3) : undefined,
    mustHaveSkills: parsedCriteria.requiredSkills || [],
    niceToHaveSkills: parsedCriteria.preferredSkills || [],
    targetLocation: parsedCriteria.locations?.[0],
    remoteOk: parsedCriteria.locations?.some(l => l.toLowerCase().includes('remote')),
    description: jobDescription,
    leadershipRequired,
  };
}
