/**
 * Screening Service - Candidate Evaluation & Fit Scoring
 *
 * Handles resume parsing, qualification assessment, and fit scoring
 * against job requirements and company Criteria.
 *
 * Key Responsibilities:
 * - Parse resumes to extract structured data
 * - Score candidates against job requirements
 * - Evaluate technical and culture fit
 * - Detect potential biases in evaluations
 * - Generate screening summaries
 */

import { v4 as uuid } from 'uuid';
import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import {
  CriteriaEvaluator,
  getCriteriaEvaluator,
} from '../../core/inner-loop/CriteriaEvaluator.js';
import type { Candidate, JobRequisition, Criteria } from '../../generated/prisma/index.js';
import type { CriteriaContent } from '../entities/Criteria.js';
import type { GeneratedOutput } from '../entities/InnerLoop.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ParsedResume {
  id: string;
  candidateId: string;

  // Contact
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;

  // Professional
  currentTitle?: string;
  currentCompany?: string;
  yearsOfExperience: number;
  summary?: string;

  // Experience
  experience: WorkExperience[];

  // Education
  education: Education[];

  // Skills
  skills: string[];
  certifications: string[];

  // Metadata
  parsedAt: Date;
  rawText: string;
}

export interface WorkExperience {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  description: string;
  highlights: string[];
}

export interface Education {
  degree: string;
  field: string;
  institution: string;
  graduationYear?: number;
  gpa?: number;
}

export interface ScreeningResult {
  id: string;
  candidateId: string;
  requisitionId: string;

  // Scores
  overallScore: number; // 0-100
  technicalScore: number;
  experienceScore: number;
  educationScore: number;
  cultureFitScore: number;

  // Analysis
  strengths: string[];
  weaknesses: string[];
  redFlags: string[];
  questions: string[]; // Questions to explore in interview

  // Requirements matching
  requirementMatches: RequirementMatch[];

  // Recommendation
  recommendation: 'strong_yes' | 'yes' | 'maybe' | 'no' | 'strong_no';
  recommendationReason: string;

  // Bias check
  biasCheckPassed: boolean;
  biasWarnings: string[];

  // Metadata
  screenedAt: Date;
  criteriaVersion: number;
}

export interface RequirementMatch {
  requirement: string;
  type: 'required' | 'preferred' | 'nice_to_have';
  matched: boolean;
  evidence?: string;
  score: number; // 0-100
}

export interface ScreeningConfig {
  tenantId: string;
  criteria: Criteria;
  strictMode?: boolean; // Require all mandatory requirements
  biasCheckEnabled?: boolean;
}

// =============================================================================
// SCREENING SERVICE
// =============================================================================

export class ScreeningService {
  private claude: ClaudeClient;
  private criteriaEvaluator: CriteriaEvaluator;

  constructor(claude?: ClaudeClient, criteriaEvaluator?: CriteriaEvaluator) {
    this.claude = claude || getClaudeClient();
    this.criteriaEvaluator = criteriaEvaluator || getCriteriaEvaluator();
  }

  // ===========================================================================
  // RESUME PARSING
  // ===========================================================================

  /**
   * Parse a resume from raw text or PDF content
   */
  async parseResume(
    candidateId: string,
    resumeContent: string,
    format: 'text' | 'pdf' | 'docx' = 'text'
  ): Promise<ParsedResume> {
    const prompt = this.buildResumeParsingPrompt(resumeContent);

    const response = await this.claude.complete({
      prompt,
      system: `You are an expert resume parser. Extract structured information from resumes accurately.
Return a JSON object with the following structure:
{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1234567890",
  "location": "City, State/Country",
  "linkedinUrl": "https://linkedin.com/in/...",
  "currentTitle": "Current Job Title",
  "currentCompany": "Current Company",
  "yearsOfExperience": 5,
  "summary": "Professional summary",
  "experience": [{
    "title": "Job Title",
    "company": "Company Name",
    "location": "City",
    "startDate": "Jan 2020",
    "endDate": "Present",
    "isCurrent": true,
    "description": "Role description",
    "highlights": ["Achievement 1", "Achievement 2"]
  }],
  "education": [{
    "degree": "BS",
    "field": "Computer Science",
    "institution": "University Name",
    "graduationYear": 2015
  }],
  "skills": ["skill1", "skill2"],
  "certifications": ["cert1", "cert2"]
}`,
      maxTokens: 2000,
    });

    const parsed = JSON.parse(response.content);

    return {
      id: uuid(),
      candidateId,
      ...parsed,
      parsedAt: new Date(),
      rawText: resumeContent,
    };
  }

  private buildResumeParsingPrompt(content: string): string {
    return `Parse the following resume and extract structured information:

---
${content}
---

Return the extracted information as a JSON object.`;
  }

  // ===========================================================================
  // SCREENING
  // ===========================================================================

  /**
   * Screen a candidate against a job requisition
   */
  async screenCandidate(
    resume: ParsedResume,
    requisition: JobRequisition,
    config: ScreeningConfig
  ): Promise<ScreeningResult> {
    // 1. Match requirements
    const requirementMatches = await this.matchRequirements(resume, requisition);

    // 2. Score different dimensions
    const technicalScore = await this.scoreTechnicalFit(resume, requisition);
    const experienceScore = this.scoreExperience(resume, requisition);
    const educationScore = this.scoreEducation(resume, requisition);
    const cultureFitScore = await this.scoreCultureFit(resume, config.criteria);

    // 3. Calculate overall score
    const overallScore = this.calculateOverallScore({
      technicalScore,
      experienceScore,
      educationScore,
      cultureFitScore,
      requirementMatches,
    });

    // 4. Generate analysis
    const analysis = await this.generateAnalysis(
      resume,
      requisition,
      requirementMatches,
      config.criteria
    );

    // 5. Run bias check
    const biasCheck = config.biasCheckEnabled !== false
      ? await this.runBiasCheck(analysis)
      : { passed: true, warnings: [] };

    // 6. Generate recommendation
    const recommendation = this.generateRecommendation(
      overallScore,
      requirementMatches,
      analysis.redFlags,
      config.strictMode
    );

    return {
      id: uuid(),
      candidateId: resume.candidateId,
      requisitionId: requisition.id,
      overallScore,
      technicalScore,
      experienceScore,
      educationScore,
      cultureFitScore,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      redFlags: analysis.redFlags,
      questions: analysis.questions,
      requirementMatches,
      recommendation: recommendation.verdict,
      recommendationReason: recommendation.reason,
      biasCheckPassed: biasCheck.passed,
      biasWarnings: biasCheck.warnings,
      screenedAt: new Date(),
      criteriaVersion: (config.criteria as unknown as { version: number }).version || 1,
    };
  }

  /**
   * Batch screen multiple candidates
   */
  async batchScreen(
    candidates: Array<{ resume: ParsedResume; requisition: JobRequisition }>,
    config: ScreeningConfig
  ): Promise<ScreeningResult[]> {
    const results: ScreeningResult[] = [];

    for (const { resume, requisition } of candidates) {
      const result = await this.screenCandidate(resume, requisition, config);
      results.push(result);
    }

    // Sort by overall score
    results.sort((a, b) => b.overallScore - a.overallScore);

    return results;
  }

  // ===========================================================================
  // REQUIREMENT MATCHING
  // ===========================================================================

  private async matchRequirements(
    resume: ParsedResume,
    requisition: JobRequisition
  ): Promise<RequirementMatch[]> {
    const requirements = this.extractRequirements(requisition);
    const matches: RequirementMatch[] = [];

    for (const req of requirements) {
      const match = await this.evaluateRequirement(resume, req);
      matches.push(match);
    }

    return matches;
  }

  private extractRequirements(requisition: JobRequisition): Array<{
    text: string;
    type: 'required' | 'preferred' | 'nice_to_have';
  }> {
    // In production, would parse from requisition.requirements field
    // For now, extract from description
    const description = (requisition as unknown as { description?: string }).description || '';

    // Simple extraction - in production would use more sophisticated parsing
    const lines = description.split('\n').filter((l) => l.trim());
    const requirements: Array<{ text: string; type: 'required' | 'preferred' | 'nice_to_have' }> = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('required') || lower.includes('must have')) {
        requirements.push({ text: line, type: 'required' });
      } else if (lower.includes('preferred') || lower.includes('ideally')) {
        requirements.push({ text: line, type: 'preferred' });
      } else if (lower.includes('nice to have') || lower.includes('bonus')) {
        requirements.push({ text: line, type: 'nice_to_have' });
      }
    }

    return requirements;
  }

  private async evaluateRequirement(
    resume: ParsedResume,
    requirement: { text: string; type: 'required' | 'preferred' | 'nice_to_have' }
  ): Promise<RequirementMatch> {
    const prompt = `Evaluate if this candidate meets the following requirement:

Requirement: ${requirement.text}

Candidate Profile:
- Skills: ${resume.skills.join(', ')}
- Experience: ${resume.experience.map((e) => `${e.title} at ${e.company}`).join('; ')}
- Education: ${resume.education.map((e) => `${e.degree} in ${e.field}`).join('; ')}

Return JSON: { "matched": true/false, "evidence": "brief explanation", "score": 0-100 }`;

    const response = await this.claude.complete({
      prompt,
      maxTokens: 200,
    });

    const result = JSON.parse(response.content);

    return {
      requirement: requirement.text,
      type: requirement.type,
      matched: result.matched,
      evidence: result.evidence,
      score: result.score,
    };
  }

  // ===========================================================================
  // SCORING
  // ===========================================================================

  private async scoreTechnicalFit(
    resume: ParsedResume,
    requisition: JobRequisition
  ): Promise<number> {
    const prompt = `Score this candidate's technical fit for the role (0-100):

Role: ${requisition.title}
Required Skills: ${(requisition as unknown as { skills?: string[] }).skills?.join(', ') || 'Not specified'}

Candidate Skills: ${resume.skills.join(', ')}
Candidate Experience:
${resume.experience.map((e) => `- ${e.title} at ${e.company}: ${e.description}`).join('\n')}

Return JSON: { "score": 0-100, "reason": "brief explanation" }`;

    const response = await this.claude.complete({ prompt, maxTokens: 150 });
    const result = JSON.parse(response.content);
    return result.score;
  }

  private scoreExperience(resume: ParsedResume, requisition: JobRequisition): number {
    const requiredYears = (requisition as unknown as { yearsRequired?: number }).yearsRequired || 3;
    const candidateYears = resume.yearsOfExperience;

    if (candidateYears >= requiredYears * 1.5) return 100;
    if (candidateYears >= requiredYears) return 85;
    if (candidateYears >= requiredYears * 0.75) return 70;
    if (candidateYears >= requiredYears * 0.5) return 50;
    return 30;
  }

  private scoreEducation(resume: ParsedResume, requisition: JobRequisition): number {
    const hasRequiredDegree = resume.education.some((ed) => {
      const degreeLevel = ed.degree.toLowerCase();
      return (
        degreeLevel.includes('bachelor') ||
        degreeLevel.includes('master') ||
        degreeLevel.includes('phd') ||
        degreeLevel.includes('bs') ||
        degreeLevel.includes('ms')
      );
    });

    return hasRequiredDegree ? 80 : 50;
  }

  private async scoreCultureFit(resume: ParsedResume, criteria: Criteria): Promise<number> {
    // Use Criteria evaluation for culture fit
    const output: GeneratedOutput = {
      type: 'screening',
      content: resume,
      metadata: {
        tokensUsed: 0,
        latencyMs: 0,
        modelId: 'evaluation',
      },
    };

    const criteriaContent = criteria as unknown as CriteriaContent;
    const evaluation = await this.criteriaEvaluator.evaluate(
      {
        output,
        taskType: 'screening',
      },
      criteriaContent
    );

    return evaluation.overallScore;
  }

  private calculateOverallScore(components: {
    technicalScore: number;
    experienceScore: number;
    educationScore: number;
    cultureFitScore: number;
    requirementMatches: RequirementMatch[];
  }): number {
    // Weighted average
    const weights = {
      technical: 0.35,
      experience: 0.25,
      education: 0.10,
      culture: 0.15,
      requirements: 0.15,
    };

    const requirementScore =
      components.requirementMatches.length > 0
        ? components.requirementMatches.reduce((sum, m) => sum + m.score, 0) /
          components.requirementMatches.length
        : 50;

    return Math.round(
      components.technicalScore * weights.technical +
        components.experienceScore * weights.experience +
        components.educationScore * weights.education +
        components.cultureFitScore * weights.culture +
        requirementScore * weights.requirements
    );
  }

  // ===========================================================================
  // ANALYSIS
  // ===========================================================================

  private async generateAnalysis(
    resume: ParsedResume,
    requisition: JobRequisition,
    matches: RequirementMatch[],
    criteria: Criteria
  ): Promise<{
    strengths: string[];
    weaknesses: string[];
    redFlags: string[];
    questions: string[];
  }> {
    const prompt = `Analyze this candidate for the role:

Role: ${requisition.title}
Company: ${(requisition as unknown as { company?: string }).company || 'Unknown'}

Candidate:
- ${resume.yearsOfExperience} years experience
- Current: ${resume.currentTitle} at ${resume.currentCompany}
- Skills: ${resume.skills.join(', ')}

Requirement Matches:
${matches.map((m) => `- ${m.requirement}: ${m.matched ? '✓' : '✗'} (${m.score}/100)`).join('\n')}

Return JSON:
{
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "redFlags": ["red flag if any"],
  "questions": ["question to explore in interview"]
}`;

    const response = await this.claude.complete({ prompt, maxTokens: 500 });
    return JSON.parse(response.content);
  }

  // ===========================================================================
  // BIAS CHECK
  // ===========================================================================

  private async runBiasCheck(analysis: {
    strengths: string[];
    weaknesses: string[];
    redFlags: string[];
    questions: string[];
  }): Promise<{ passed: boolean; warnings: string[] }> {
    const allText = [
      ...analysis.strengths,
      ...analysis.weaknesses,
      ...analysis.redFlags,
      ...analysis.questions,
    ].join(' ');

    const prompt = `Check this screening analysis for potential bias:

"${allText}"

Look for:
- Age bias (e.g., "overqualified", "too junior")
- Gender bias (gendered language)
- Ethnic/cultural bias
- Disability bias
- Other protected characteristics

Return JSON: { "passed": true/false, "warnings": ["warning1", "warning2"] }`;

    const response = await this.claude.complete({ prompt, maxTokens: 200 });
    return JSON.parse(response.content);
  }

  // ===========================================================================
  // RECOMMENDATION
  // ===========================================================================

  private generateRecommendation(
    overallScore: number,
    matches: RequirementMatch[],
    redFlags: string[],
    strictMode?: boolean
  ): { verdict: ScreeningResult['recommendation']; reason: string } {
    // Check if all required requirements are met in strict mode
    if (strictMode) {
      const requiredMissing = matches.filter(
        (m) => m.type === 'required' && !m.matched
      );
      if (requiredMissing.length > 0) {
        return {
          verdict: 'no',
          reason: `Missing required qualifications: ${requiredMissing.map((m) => m.requirement).join(', ')}`,
        };
      }
    }

    // Check red flags
    if (redFlags.length > 2) {
      return {
        verdict: 'no',
        reason: `Multiple red flags identified: ${redFlags.join('; ')}`,
      };
    }

    // Score-based recommendation
    if (overallScore >= 85) {
      return {
        verdict: 'strong_yes',
        reason: `Excellent fit with ${overallScore}% match score`,
      };
    }
    if (overallScore >= 70) {
      return {
        verdict: 'yes',
        reason: `Good fit with ${overallScore}% match score`,
      };
    }
    if (overallScore >= 55) {
      return {
        verdict: 'maybe',
        reason: `Moderate fit with ${overallScore}% match score - worth exploring`,
      };
    }
    if (overallScore >= 40) {
      return {
        verdict: 'no',
        reason: `Below threshold with ${overallScore}% match score`,
      };
    }
    return {
      verdict: 'strong_no',
      reason: `Poor fit with ${overallScore}% match score`,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ScreeningService | null = null;

export function getScreeningService(): ScreeningService {
  if (!instance) {
    instance = new ScreeningService();
  }
  return instance;
}

export function resetScreeningService(): void {
  instance = null;
}
