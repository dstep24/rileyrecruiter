/**
 * Sourcing Prompts
 *
 * Centralized prompt templates for all AI-powered sourcing operations.
 * These prompts are used by AIQueryGenerator, AICandidateScorer, and AIOutreachGenerator.
 */

// =============================================================================
// SENIORITY LEVEL DEFINITIONS
// =============================================================================

export const SENIORITY_DEFINITIONS = `
SENIORITY LEVEL MAPPING:
- IC (Individual Contributor): Engineer, Developer, Designer, Analyst
  → Does technical work, no direct reports
  → Typical experience: 0-10+ years
  → Titles: Software Engineer, Senior Developer, Staff Engineer

- Lead: Tech Lead, Team Lead, Principal
  → Small team guidance (3-7 people), still hands-on
  → Typical experience: 5-12 years
  → Titles: Tech Lead, Principal Engineer, Staff Software Engineer

- Manager: Engineering Manager, Product Manager
  → Manages people directly (typically 5-15)
  → Typical experience: 5-12 years
  → Titles: Engineering Manager, Software Development Manager

- Senior Manager: Senior Manager, Group Manager
  → Manages managers OR large teams (15-30)
  → Typical experience: 8-15 years
  → Titles: Senior Engineering Manager, Group Product Manager

- Director: Director, Head of
  → Owns a function, multiple teams (20-100+)
  → Typical experience: 10-20 years
  → Titles: Director of Engineering, Head of Product, Engineering Director

- VP: Vice President
  → Executive level, multiple functions, org strategy
  → Typical experience: 12-25 years
  → Titles: VP of Engineering, VP Product, Vice President of Technology

- C-Level: CTO, CEO, CPO
  → Company-wide responsibility
  → Typical experience: 15+ years
  → Titles: Chief Technology Officer, Chief Product Officer
`;

// =============================================================================
// QUERY GENERATION PROMPTS
// =============================================================================

export const QUERY_GENERATION_SYSTEM = `You are an expert technical recruiter creating optimal LinkedIn search strategies.

${SENIORITY_DEFINITIONS}

Your job is to analyze a job description and create a search strategy that will:
1. Find candidates at the RIGHT seniority level
2. Include relevant title variants
3. EXCLUDE titles that indicate wrong level
4. Identify positive experience signals
5. Flag red flags that disqualify candidates

Output valid JSON only.`;

export const QUERY_GENERATION_USER = `
Analyze this job and create an optimal LinkedIn search strategy.

## Job Details
Title: {{title}}
Location: {{location}}

### Job Description
{{description}}

### Requirements
{{requirements}}

### Preferred Skills
{{preferredSkills}}

## Output Required (JSON)
{
  "seniorityLevel": "<IC|Lead|Manager|Senior Manager|Director|VP|C-Level>",
  "levelRationale": "<why this level based on JD>",
  "minYearsExperience": <number>,
  "primaryTitles": ["<main title>"],
  "titleVariants": ["<equivalent titles>"],
  "excludeTitles": ["<titles that indicate wrong level>"],
  "mustHaveSkills": ["<required skills>"],
  "niceToHaveSkills": ["<preferred skills>"],
  "skillWeights": { "<skill>": <0.4-1.0> },
  "leadershipIndicators": ["<phrases indicating leadership>"],
  "achievementPatterns": ["<achievement phrases to look for>"],
  "redFlags": ["<phrases that disqualify>"],
  "searchQueries": [
    {
      "query": "<boolean search string>",
      "priority": <1-3>,
      "rationale": "<why this query>"
    }
  ],
  "reasoning": "<overall strategy>",
  "confidence": <0.0-1.0>
}`;

// =============================================================================
// CANDIDATE SCORING PROMPTS
// =============================================================================

export const CANDIDATE_SCORING_SYSTEM = `You are an expert technical recruiter evaluating candidates.

${SENIORITY_DEFINITIONS}

SCORING PRINCIPLES:
1. Seniority signals matter MORE than years
2. Title progression shows growth: IC → Lead → Manager → Director → VP
3. Leadership language: "Led team of", "Built", "Scaled", "Grew from X to Y"
4. Achievement language: "Launched", "Delivered", "Increased by", "Reduced by"
5. Red flags: "Intern", "Junior", only IC experience for leadership roles

Be RIGOROUS about seniority matching. A 15-year IC is NOT qualified for a Director role.

Output valid JSON only.`;

export const CANDIDATE_SCORING_USER = `
Evaluate this candidate for the {{roleTitle}} position.

## Role Requirements
- Level: {{seniorityLevel}}
- Min Experience: {{minYearsExperience}} years
- Must-Have Skills: {{mustHaveSkills}}
- Target Location: {{targetLocation}}
- Leadership Required: {{leadershipRequired}}

## Candidate Profile
Name: {{candidateName}}
Current: {{currentTitle}} at {{currentCompany}}
Location: {{candidateLocation}}

### Experience
{{#each experiences}}
- {{title}} at {{company}} ({{duration}})
  {{description}}
{{/each}}

### Skills
{{skills}}

## Scoring Dimensions

1. **Seniority Match** (Weight: 0.30)
   - Ready for {{seniorityLevel}} level?
   - Prior similar responsibility?

2. **Technical Fit** (Weight: 0.25)
   - Has must-have skills?
   - Evidence of depth?

3. **Career Trajectory** (Weight: 0.20)
   - Growing responsibility?
   - Clear progression path?

4. **Leadership Evidence** (Weight: 0.15)
   - People management evidence?
   - Leadership language?

5. **Location Match** (Weight: 0.10)
   - In target location?
   - Relocation likely?

## Output (JSON)
{
  "overallScore": <0-100>,
  "dimensions": {
    "seniorityMatch": { "score": <0-100>, "reasoning": "<brief>", "evidence": ["<from profile>"] },
    "technicalFit": { "score": <0-100>, "reasoning": "<brief>", "evidence": ["<from profile>"] },
    "careerTrajectory": { "score": <0-100>, "reasoning": "<brief>", "evidence": ["<from profile>"] },
    "leadershipEvidence": { "score": <0-100>, "reasoning": "<brief>", "evidence": ["<from profile>"] },
    "locationMatch": { "score": <0-100>, "reasoning": "<brief>", "evidence": ["<from profile>"] }
  },
  "recommendation": "<STRONG_YES|YES|MAYBE|NO|STRONG_NO>",
  "highlights": ["<top reasons to pursue>"],
  "concerns": ["<issues to explore>"],
  "suggestedApproach": "<how to pitch to them>"
}`;

// =============================================================================
// OUTREACH GENERATION PROMPTS
// =============================================================================

export const OUTREACH_GENERATION_SYSTEM = `You are an expert recruiter writing personalized outreach.

PRINCIPLES:
1. Lead with THEM, not the opportunity
2. Reference SPECIFIC things from their background
3. Connect their experience to the role
4. Keep it conversational
5. Low-pressure call to action

GOOD OPENINGS:
- "Your work scaling Stripe's payments team caught my attention"
- "Saw your post about ML infrastructure challenges - we're solving that"

BAD OPENINGS:
- "I came across your profile" (generic)
- "Hope this finds you well" (waste of characters)
- "We have an exciting opportunity" (cliché)

BRAND VOICES:
- professional: Formal, achievement-focused
- professional-warm: Formal but approachable
- casual-friendly: Relaxed, peer-to-peer
- technical-peer: Dev-to-dev, tech specifics
- executive: Concise, strategic

Output valid JSON only.`;

export const OUTREACH_GENERATION_USER = `
Write a {{channel}} to recruit {{candidateName}}.

## Character Limit
{{charLimit}} characters maximum.

## Candidate
Current: {{currentTitle}} at {{currentCompany}}
Highlights: {{candidateHighlights}}
Suggested Approach: {{suggestedApproach}}

Experience:
{{experienceSummary}}

## Role
{{roleTitle}} at {{company}}
Compelling Points: {{roleHighlights}}

## Guidelines
Voice: {{brandVoice}}
CTA: {{callToAction}}
Avoid: {{avoidPhrases}}
From: {{recruiterName}}

## Output (JSON)
{
  {{#if includeSubject}}"subject": "<compelling subject>",{{/if}}
  "message": "<full message under {{charLimit}} chars>",
  "personalization": {
    "elements": ["<what you personalized>"],
    "reasoning": "<why these elements>"
  },
  "alternatives": ["<version 2>", "<version 3>"]
}`;

// =============================================================================
// FEEDBACK LEARNING PROMPTS
// =============================================================================

export const REJECTION_ANALYSIS_SYSTEM = `You are analyzing why candidates were rejected to improve future searches.

Your goal is to identify patterns that should be:
1. Added as exclusion criteria
2. Added as red flags
3. Used to adjust search queries

Output valid JSON only.`;

export const REJECTION_ANALYSIS_USER = `
These candidates were rejected for a {{roleTitle}} position.

## Role Requirements
Level: {{seniorityLevel}}
Min Experience: {{minYearsExperience}} years
Must-Have Skills: {{mustHaveSkills}}

## Rejected Candidates
{{#each rejectedCandidates}}
### {{name}}
Rejection Reason: {{rejectionReason}}
Profile:
- Current: {{currentTitle}} at {{currentCompany}}
- Experience: {{totalYears}} years
- Skills: {{skills}}
{{/each}}

## Analysis Required (JSON)
{
  "patterns": [
    {
      "type": "title_pattern|experience_gap|skill_mismatch|seniority_mismatch|other",
      "description": "<what pattern was found>",
      "frequency": <how many candidates matched>,
      "suggestedAction": "<how to avoid in future>"
    }
  ],
  "recommendedExclusions": ["<titles or terms to exclude>"],
  "recommendedRedFlags": ["<phrases to flag>"],
  "searchQueryAdjustments": ["<how to modify searches>"],
  "confidenceScore": <0.0-1.0>
}`;

export const SUCCESS_ANALYSIS_SYSTEM = `You are analyzing successful placements to improve future searches.

Your goal is to identify patterns that should be:
1. Prioritized in searches
2. Added as positive signals
3. Used to weight candidates higher

Output valid JSON only.`;

export const SUCCESS_ANALYSIS_USER = `
These candidates were successfully placed for {{roleTitle}} positions.

## Role Requirements
Level: {{seniorityLevel}}
Skills: {{skills}}

## Successful Candidates
{{#each successfulCandidates}}
### {{name}}
Outcome: {{outcome}}
Profile:
- Previous: {{previousTitle}} at {{previousCompany}}
- Experience: {{totalYears}} years
- Key Skills: {{skills}}
- What Made Them Successful: {{successFactors}}
{{/each}}

## Analysis Required (JSON)
{
  "successPatterns": [
    {
      "type": "background|skill|company|trajectory|other",
      "description": "<what pattern led to success>",
      "frequency": <how many candidates matched>,
      "importance": <0.0-1.0>
    }
  ],
  "recommendedSearchTerms": ["<terms to prioritize>"],
  "recommendedCompanies": ["<companies that produce good candidates>"],
  "recommendedTitles": ["<titles that indicate success>"],
  "scoringAdjustments": {
    "<dimension>": <weight adjustment>
  },
  "confidenceScore": <0.0-1.0>
}`;

// =============================================================================
// TEMPLATE HELPERS
// =============================================================================

/**
 * Simple Handlebars-like template interpolation
 */
export function interpolateTemplate(
  template: string,
  variables: Record<string, unknown>
): string {
  let result = template;

  // Replace {{variable}} patterns
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, String(value ?? ''));
  }

  // Handle {{#each array}}...{{/each}} blocks
  const eachPattern = /\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
  result = result.replace(eachPattern, (_, arrayName, template) => {
    const array = variables[arrayName];
    if (!Array.isArray(array)) return '';
    return array.map((item: Record<string, unknown>) => {
      let itemResult = template;
      for (const [key, value] of Object.entries(item)) {
        const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        itemResult = itemResult.replace(pattern, String(value ?? ''));
      }
      return itemResult;
    }).join('');
  });

  // Handle {{#if condition}}...{{/if}} blocks
  const ifPattern = /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifPattern, (_, varName, content) => {
    return variables[varName] ? content : '';
  });

  return result;
}

/**
 * Format experience array for prompts
 */
export function formatExperiences(
  experiences: Array<{
    title: string;
    company: string;
    duration: string;
    description?: string;
  }>,
  maxItems = 5
): string {
  return experiences.slice(0, maxItems).map((exp, i) =>
    `${i + 1}. ${exp.title} at ${exp.company} (${exp.duration})${exp.description ? `\n   ${exp.description.slice(0, 200)}` : ''}`
  ).join('\n');
}

/**
 * Format skills array for prompts
 */
export function formatSkills(skills: string[], maxItems = 15): string {
  return skills.slice(0, maxItems).join(', ');
}
