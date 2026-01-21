/**
 * AI Assessment Generator
 *
 * Generates tailored pre-screening assessment questions based on job descriptions.
 * Uses Claude to analyze the job requirements and create relevant questions that
 * help identify qualified candidates.
 *
 * Question types generated:
 * - Work authorization / visa status
 * - Availability / notice period
 * - Salary expectations
 * - Technical experience validation
 * - Role-specific situational questions
 * - Culture fit indicators
 */

import { getClaudeClient, ClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import { prismaBase } from '../../infrastructure/database/prisma.js';
import type { QuestionType } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface JobContext {
  title: string;
  description: string;
  requirements: string[];
  preferredSkills: string[];
  location?: string;
  locationType?: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNSPECIFIED';
  salaryRange?: { min?: number; max?: number; currency?: string };
  seniorityLevel?: string;
  roleType?: string; // engineering, sales, product, etc.
}

export interface GeneratedQuestion {
  questionText: string;
  questionType: QuestionType;
  options?: string[];
  isRequired: boolean;
  scoringWeight: number;
  idealAnswer?: string;
  category: 'logistics' | 'technical' | 'experience' | 'culture' | 'salary';
}

export interface GeneratedAssessment {
  name: string;
  description: string;
  questions: GeneratedQuestion[];
  roleType: string;
}

// =============================================================================
// PROMPTS
// =============================================================================

const ASSESSMENT_GENERATION_PROMPT = `You are an expert technical recruiter creating a pre-screening assessment for candidates.

## Your Task
Generate 6-10 targeted pre-screening questions based on the job description provided. The questions should help quickly identify qualified candidates and filter out those who don't meet basic requirements.

## Question Categories (include at least one from each relevant category)

### 1. LOGISTICS (Required for all roles)
- Work authorization / visa sponsorship needs
- Start date / availability / notice period
- Location preferences / relocation willingness (if not fully remote)

### 2. SALARY ALIGNMENT
- Compensation expectations (to catch misalignment early)
- Benefits priorities

### 3. TECHNICAL VALIDATION (for technical roles)
- Years of experience with key technologies
- Specific technical scenarios relevant to the role
- Project scale / complexity they've handled

### 4. EXPERIENCE DEPTH
- Team size they've managed (for leadership roles)
- Specific domain experience
- Career progression / growth trajectory

### 5. CULTURE FIT
- Work style preferences
- What they're looking for in their next role
- Deal-breakers / must-haves

## Question Type Options
- YES_NO: Simple yes/no questions (best for deal-breakers like sponsorship)
- MULTIPLE_CHOICE: Predefined options (best for categorical answers)
- SCALE: 1-5 rating scale (best for experience levels)
- TEXT: Free-form response (best for open-ended questions - use sparingly, max 2)

## Scoring Guidelines
- scoringWeight: 1-3 (1=nice-to-know, 2=important, 3=critical)
- idealAnswer: The preferred answer for auto-scoring (leave null for open-ended)

## Output Format (JSON array)
{
  "name": "Assessment name based on role",
  "description": "Brief description of what this assessment evaluates",
  "questions": [
    {
      "questionText": "Do you require visa sponsorship to work in the US?",
      "questionType": "YES_NO",
      "options": null,
      "isRequired": true,
      "scoringWeight": 3,
      "idealAnswer": "No",
      "category": "logistics"
    },
    {
      "questionText": "How many years of experience do you have with TypeScript?",
      "questionType": "MULTIPLE_CHOICE",
      "options": ["Less than 1 year", "1-2 years", "3-5 years", "5+ years"],
      "isRequired": true,
      "scoringWeight": 2,
      "idealAnswer": "3-5 years",
      "category": "technical"
    }
  ],
  "roleType": "engineering"
}

## Important Notes
- Keep questions concise and clear
- Don't ask redundant questions
- Order questions from most critical (deal-breakers) to nice-to-have
- Include idealAnswer for questions where there's a clear preferred response
- For TEXT questions, provide null for options and idealAnswer
- Limit TEXT questions to 2 max (they're harder to score)`;

// =============================================================================
// AI ASSESSMENT GENERATOR CLASS
// =============================================================================

export class AIAssessmentGenerator {
  private claudeClient: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient || getClaudeClient();
  }

  /**
   * Generate assessment questions from a job context
   */
  async generateAssessment(jobContext: JobContext): Promise<GeneratedAssessment> {
    const prompt = this.buildPrompt(jobContext);

    try {
      const response = await this.claudeClient.chat({
        prompt,
        systemPrompt: ASSESSMENT_GENERATION_PROMPT,
        temperature: 0.4, // Some creativity but consistent
        maxTokens: 2000,
      });

      const parsed = this.claudeClient.parseJsonResponse<GeneratedAssessment>(response);
      return this.validateAndCleanAssessment(parsed, jobContext);
    } catch (error) {
      console.error('[AIAssessmentGenerator] Failed to generate assessment:', error);
      // Return a fallback assessment with standard questions
      return this.getFallbackAssessment(jobContext);
    }
  }

  /**
   * Generate and save assessment to database, linked to job requisition
   */
  async generateAndSaveAssessment(
    jobRequisitionId: string,
    tenantId: string
  ): Promise<{ templateId: string; assessment: GeneratedAssessment }> {
    // Get the job requisition
    const requisition = await prismaBase.jobRequisition.findUnique({
      where: { id: jobRequisitionId },
    });

    if (!requisition) {
      throw new Error(`Job requisition not found: ${jobRequisitionId}`);
    }

    // Build job context
    const jobContext: JobContext = {
      title: requisition.title,
      description: requisition.description,
      requirements: (requisition.requirements as string[]) || [],
      preferredSkills: (requisition.preferredSkills as string[]) || [],
      location: requisition.location || undefined,
      locationType: requisition.locationType as JobContext['locationType'],
      salaryRange: requisition.salaryRange as JobContext['salaryRange'],
    };

    // Generate assessment
    const assessment = await this.generateAssessment(jobContext);

    // Save to database
    const template = await prismaBase.preScreeningTemplate.create({
      data: {
        tenantId,
        name: assessment.name,
        description: assessment.description,
        roleType: assessment.roleType,
        jobRequisitionId,
        isAutoGenerated: true,
        questions: {
          create: assessment.questions.map((q, index) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options ? JSON.parse(JSON.stringify(q.options)) : null,
            isRequired: q.isRequired,
            orderIndex: index,
            scoringWeight: q.scoringWeight,
            idealAnswer: q.idealAnswer,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    return { templateId: template.id, assessment };
  }

  /**
   * Get or generate assessment for a job requisition
   * Returns existing if one exists, otherwise generates new
   */
  async getOrGenerateAssessment(
    jobRequisitionId: string,
    tenantId: string
  ): Promise<{ templateId: string; isNew: boolean }> {
    // Check for existing assessment
    const existing = await prismaBase.preScreeningTemplate.findFirst({
      where: {
        jobRequisitionId,
        isActive: true,
      },
    });

    if (existing) {
      return { templateId: existing.id, isNew: false };
    }

    // Generate new assessment
    const { templateId } = await this.generateAndSaveAssessment(jobRequisitionId, tenantId);
    return { templateId, isNew: true };
  }

  /**
   * Build the prompt for Claude
   */
  private buildPrompt(jobContext: JobContext): string {
    const locationInfo = jobContext.location
      ? `Location: ${jobContext.location} (${jobContext.locationType || 'Not specified'})`
      : jobContext.locationType === 'REMOTE'
        ? 'Location: Fully Remote'
        : '';

    const salaryInfo = jobContext.salaryRange
      ? `Salary Range: ${jobContext.salaryRange.currency || '$'}${jobContext.salaryRange.min?.toLocaleString() || '?'} - ${jobContext.salaryRange.currency || '$'}${jobContext.salaryRange.max?.toLocaleString() || '?'}`
      : '';

    return `Generate a pre-screening assessment for this role:

## Job Title
${jobContext.title}

## Job Description
${jobContext.description}

## Requirements
${jobContext.requirements.map((r) => `- ${r}`).join('\n') || 'Not specified'}

## Preferred Skills
${jobContext.preferredSkills.map((s) => `- ${s}`).join('\n') || 'Not specified'}

${locationInfo}
${salaryInfo}
${jobContext.seniorityLevel ? `Seniority: ${jobContext.seniorityLevel}` : ''}

Generate a tailored pre-screening assessment with 6-10 questions. Output valid JSON only.`;
  }

  /**
   * Validate and clean the generated assessment
   */
  private validateAndCleanAssessment(
    assessment: GeneratedAssessment,
    jobContext: JobContext
  ): GeneratedAssessment {
    // Ensure required fields
    if (!assessment.name) {
      assessment.name = `${jobContext.title} Pre-Screen`;
    }
    if (!assessment.description) {
      assessment.description = `Pre-screening assessment for ${jobContext.title} candidates`;
    }
    if (!assessment.roleType) {
      assessment.roleType = this.inferRoleType(jobContext.title);
    }

    // Validate questions
    assessment.questions = assessment.questions.map((q) => ({
      ...q,
      questionType: this.validateQuestionType(q.questionType),
      isRequired: q.isRequired ?? true,
      scoringWeight: Math.min(3, Math.max(1, q.scoringWeight || 1)),
      category: q.category || 'experience',
    }));

    return assessment;
  }

  /**
   * Validate question type is a valid enum value
   */
  private validateQuestionType(type: string): QuestionType {
    const validTypes: QuestionType[] = ['MULTIPLE_CHOICE', 'TEXT', 'YES_NO', 'SCALE', 'DATE'];
    if (validTypes.includes(type as QuestionType)) {
      return type as QuestionType;
    }
    return 'TEXT';
  }

  /**
   * Infer role type from job title
   */
  private inferRoleType(title: string): string {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('engineer') || titleLower.includes('developer') || titleLower.includes('programmer')) {
      return 'engineering';
    }
    if (titleLower.includes('product')) {
      return 'product';
    }
    if (titleLower.includes('design')) {
      return 'design';
    }
    if (titleLower.includes('sales') || titleLower.includes('account')) {
      return 'sales';
    }
    if (titleLower.includes('marketing')) {
      return 'marketing';
    }
    if (titleLower.includes('operations') || titleLower.includes('ops')) {
      return 'operations';
    }
    return 'general';
  }

  /**
   * Fallback assessment when AI generation fails
   */
  private getFallbackAssessment(jobContext: JobContext): GeneratedAssessment {
    const roleType = this.inferRoleType(jobContext.title);
    const isEngineering = roleType === 'engineering';
    const hasLocation = jobContext.location && jobContext.locationType !== 'REMOTE';

    const questions: GeneratedQuestion[] = [
      {
        questionText: 'Do you require visa sponsorship to work in this location?',
        questionType: 'YES_NO',
        isRequired: true,
        scoringWeight: 3,
        idealAnswer: 'No',
        category: 'logistics',
      },
      {
        questionText: 'How soon are you available to start a new role?',
        questionType: 'MULTIPLE_CHOICE',
        options: ['Immediately', 'Within 2 weeks', '2-4 weeks', '1-2 months', '2+ months'],
        isRequired: true,
        scoringWeight: 2,
        idealAnswer: 'Within 2 weeks',
        category: 'logistics',
      },
    ];

    if (hasLocation) {
      questions.push({
        questionText: `Are you currently located in or willing to relocate to ${jobContext.location}?`,
        questionType: 'MULTIPLE_CHOICE',
        options: ['Yes, I currently live there', 'Yes, willing to relocate', 'Only if remote is available', 'No'],
        isRequired: true,
        scoringWeight: 3,
        idealAnswer: 'Yes, I currently live there',
        category: 'logistics',
      });
    }

    questions.push({
      questionText: 'What are your salary expectations for this role?',
      questionType: 'TEXT',
      isRequired: true,
      scoringWeight: 2,
      category: 'salary',
    });

    if (isEngineering) {
      questions.push({
        questionText: 'How many years of professional software development experience do you have?',
        questionType: 'MULTIPLE_CHOICE',
        options: ['0-2 years', '2-5 years', '5-8 years', '8-12 years', '12+ years'],
        isRequired: true,
        scoringWeight: 2,
        category: 'experience',
      });
    }

    questions.push({
      questionText: 'What interests you most about this opportunity?',
      questionType: 'TEXT',
      isRequired: true,
      scoringWeight: 1,
      category: 'culture',
    });

    return {
      name: `${jobContext.title} Pre-Screen`,
      description: `Pre-screening assessment for ${jobContext.title} candidates`,
      questions,
      roleType,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: AIAssessmentGenerator | null = null;

export function getAIAssessmentGenerator(): AIAssessmentGenerator {
  if (!instance) {
    instance = new AIAssessmentGenerator();
  }
  return instance;
}

export function resetAIAssessmentGenerator(): void {
  instance = null;
}

export const aiAssessmentGenerator = getAIAssessmentGenerator();
