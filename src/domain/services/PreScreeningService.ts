/**
 * PreScreeningService - Manages pre-screening assessment templates, links, and responses
 *
 * This service handles:
 * - Creating and managing assessment templates with questions
 * - Generating secure JWT-based assessment links for candidates
 * - Storing and retrieving candidate responses
 * - Triggering AI scoring of completed assessments
 * - Updating conversation stages based on assessment status
 */

import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { prismaBase } from '../../infrastructure/database/prisma.js';
import type {
  PreScreeningTemplate,
  PreScreeningQuestion,
  PreScreeningResponse,
  PreScreeningAnswer,
  QuestionType,
  ResponseStatus,
} from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  description?: string;
  roleType?: string;
  questions: CreateQuestionInput[];
}

export interface CreateQuestionInput {
  questionText: string;
  questionType: QuestionType;
  options?: string[];
  isRequired?: boolean;
  scoringWeight?: number;
  idealAnswer?: string;
}

export interface CreateAssessmentLinkInput {
  templateId: string;
  conversationId: string;
  candidateName?: string;
  candidateEmail?: string;
  expiresInDays?: number;
}

export interface AssessmentLinkResult {
  responseId: string;
  accessToken: string;
  url: string;
  expiresAt: Date;
}

export interface SubmitAnswersInput {
  accessToken: string;
  answers: {
    questionId: string;
    answerText: string;
    answerValue?: unknown;
  }[];
  candidateName?: string;
  candidateEmail?: string;
}

export interface AssessmentFormData {
  responseId: string;
  templateName: string;
  templateDescription?: string;
  candidateName?: string;
  questions: {
    id: string;
    questionText: string;
    questionType: QuestionType;
    options?: string[];
    isRequired: boolean;
    orderIndex: number;
  }[];
  status: ResponseStatus;
  expiresAt: Date;
}

export interface AssessmentResult {
  response: PreScreeningResponse;
  template: PreScreeningTemplate;
  answers: (PreScreeningAnswer & {
    question: PreScreeningQuestion;
  })[];
}

// =============================================================================
// JWT CONFIG
// =============================================================================

const JWT_SECRET = process.env.ASSESSMENT_JWT_SECRET || process.env.JWT_SECRET || 'riley-assessment-secret-change-in-production';
const DEFAULT_EXPIRY_DAYS = 7;

// =============================================================================
// SERVICE
// =============================================================================

export class PreScreeningService {
  // ---------------------------------------------------------------------------
  // TEMPLATE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Create a new assessment template with questions
   */
  async createTemplate(input: CreateTemplateInput): Promise<PreScreeningTemplate> {
    const template = await prismaBase.preScreeningTemplate.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        roleType: input.roleType,
        questions: {
          create: input.questions.map((q, index) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options ? JSON.parse(JSON.stringify(q.options)) : null,
            isRequired: q.isRequired ?? true,
            orderIndex: index,
            scoringWeight: q.scoringWeight ?? 1,
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

    return template;
  }

  /**
   * Get a template by ID with questions
   */
  async getTemplate(templateId: string): Promise<PreScreeningTemplate | null> {
    return prismaBase.preScreeningTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  /**
   * List all templates for a tenant
   */
  async listTemplates(
    tenantId: string,
    options?: { activeOnly?: boolean }
  ): Promise<PreScreeningTemplate[]> {
    return prismaBase.preScreeningTemplate.findMany({
      where: {
        tenantId,
        ...(options?.activeOnly ? { isActive: true } : {}),
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update a template
   */
  async updateTemplate(
    templateId: string,
    updates: {
      name?: string;
      description?: string;
      roleType?: string;
      isActive?: boolean;
    }
  ): Promise<PreScreeningTemplate> {
    return prismaBase.preScreeningTemplate.update({
      where: { id: templateId },
      data: updates,
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    });
  }

  /**
   * Delete a template (soft delete by deactivating)
   */
  async deleteTemplate(templateId: string): Promise<void> {
    await prismaBase.preScreeningTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
  }

  // ---------------------------------------------------------------------------
  // ASSESSMENT LINK GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Create an assessment response record and generate a secure access link
   */
  async createAssessmentLink(input: CreateAssessmentLinkInput): Promise<AssessmentLinkResult> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS));

    const responseId = uuid();

    // Generate JWT token
    const accessToken = jwt.sign(
      {
        responseId,
        templateId: input.templateId,
        conversationId: input.conversationId,
        type: 'assessment',
      },
      JWT_SECRET,
      { expiresIn: `${input.expiresInDays ?? DEFAULT_EXPIRY_DAYS}d` }
    );

    // Create the response record
    await prismaBase.preScreeningResponse.create({
      data: {
        id: responseId,
        templateId: input.templateId,
        conversationId: input.conversationId,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail,
        accessToken,
        expiresAt,
        status: 'PENDING',
      },
    });

    // Update conversation stage to ASSESSMENT_SENT
    try {
      await prismaBase.rileyConversation.updateMany({
        where: { id: input.conversationId },
        data: { stage: 'ASSESSMENT_SENT' },
      });
    } catch {
      // Conversation might not exist in database yet (in-memory only)
      console.log('[PreScreening] Could not update conversation stage - may be in-memory only');
    }

    // Generate the URL (using dashboard base URL)
    const baseUrl = process.env.DASHBOARD_URL || 'http://localhost:3001';
    const url = `${baseUrl}/assessment/${accessToken}`;

    return {
      responseId,
      accessToken,
      url,
      expiresAt,
    };
  }

  // ---------------------------------------------------------------------------
  // PUBLIC ASSESSMENT ACCESS
  // ---------------------------------------------------------------------------

  /**
   * Validate an assessment token and return the form data
   */
  async getAssessmentForm(accessToken: string): Promise<AssessmentFormData | null> {
    try {
      // Verify JWT
      const decoded = jwt.verify(accessToken, JWT_SECRET) as {
        responseId: string;
        templateId: string;
        conversationId: string;
        type: string;
      };

      if (decoded.type !== 'assessment') {
        return null;
      }

      // Get the response record
      const response = await prismaBase.preScreeningResponse.findUnique({
        where: { accessToken },
        include: {
          template: {
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
      });

      if (!response) {
        return null;
      }

      // Check if expired
      if (new Date() > response.expiresAt) {
        // Mark as expired
        await prismaBase.preScreeningResponse.update({
          where: { id: response.id },
          data: { status: 'EXPIRED' },
        });
        return null;
      }

      // Check if already completed
      if (response.status === 'COMPLETED') {
        return null; // Don't allow re-submission
      }

      return {
        responseId: response.id,
        templateName: response.template.name,
        templateDescription: response.template.description ?? undefined,
        candidateName: response.candidateName ?? undefined,
        questions: response.template.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options as string[] | undefined,
          isRequired: q.isRequired,
          orderIndex: q.orderIndex,
        })),
        status: response.status,
        expiresAt: response.expiresAt,
      };
    } catch (error) {
      console.error('[PreScreening] Token validation error:', error);
      return null;
    }
  }

  /**
   * Submit assessment answers
   */
  async submitAnswers(input: SubmitAnswersInput): Promise<{
    success: boolean;
    responseId?: string;
    error?: string;
  }> {
    try {
      // Verify JWT
      const decoded = jwt.verify(input.accessToken, JWT_SECRET) as {
        responseId: string;
        templateId: string;
        conversationId: string;
        type: string;
      };

      if (decoded.type !== 'assessment') {
        return { success: false, error: 'Invalid token type' };
      }

      // Get the response record
      const response = await prismaBase.preScreeningResponse.findUnique({
        where: { accessToken: input.accessToken },
      });

      if (!response) {
        return { success: false, error: 'Assessment not found' };
      }

      if (new Date() > response.expiresAt) {
        return { success: false, error: 'Assessment has expired' };
      }

      if (response.status === 'COMPLETED') {
        return { success: false, error: 'Assessment already submitted' };
      }

      // Create answers in transaction
      await prismaBase.$transaction(async (tx) => {
        // Create all answers
        for (const answer of input.answers) {
          await tx.preScreeningAnswer.create({
            data: {
              responseId: response.id,
              questionId: answer.questionId,
              answerText: answer.answerText,
              answerValue: answer.answerValue ? JSON.parse(JSON.stringify(answer.answerValue)) : null,
            },
          });
        }

        // Update response status
        await tx.preScreeningResponse.update({
          where: { id: response.id },
          data: {
            status: 'COMPLETED',
            submittedAt: new Date(),
            candidateName: input.candidateName ?? response.candidateName,
            candidateEmail: input.candidateEmail ?? response.candidateEmail,
          },
        });

        // Update conversation stage
        try {
          await tx.rileyConversation.updateMany({
            where: { id: decoded.conversationId },
            data: { stage: 'ASSESSMENT_COMPLETE' },
          });
        } catch {
          // Conversation might not exist
        }
      });

      return { success: true, responseId: response.id };
    } catch (error) {
      console.error('[PreScreening] Submit answers error:', error);
      return { success: false, error: 'Failed to submit answers' };
    }
  }

  // ---------------------------------------------------------------------------
  // RESPONSE MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Get assessment results for a conversation
   */
  async getAssessmentForConversation(conversationId: string): Promise<AssessmentResult | null> {
    const response = await prismaBase.preScreeningResponse.findFirst({
      where: { conversationId },
      include: {
        template: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!response) {
      return null;
    }

    return {
      response,
      template: response.template,
      answers: response.answers,
    };
  }

  /**
   * Get assessment by response ID
   */
  async getAssessmentById(responseId: string): Promise<AssessmentResult | null> {
    const response = await prismaBase.preScreeningResponse.findUnique({
      where: { id: responseId },
      include: {
        template: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!response) {
      return null;
    }

    return {
      response,
      template: response.template,
      answers: response.answers,
    };
  }

  /**
   * List all responses for a template
   */
  async listResponses(
    templateId: string,
    options?: { status?: ResponseStatus }
  ): Promise<PreScreeningResponse[]> {
    return prismaBase.preScreeningResponse.findMany({
      where: {
        templateId,
        ...(options?.status ? { status: options.status } : {}),
      },
      include: {
        answers: {
          include: {
            question: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update AI scoring results for a response
   */
  async updateScoringResults(
    responseId: string,
    results: {
      aiScore: number;
      aiSummary: string;
      aiFlags?: string[];
    }
  ): Promise<PreScreeningResponse> {
    return prismaBase.preScreeningResponse.update({
      where: { id: responseId },
      data: {
        aiScore: results.aiScore,
        aiSummary: results.aiSummary,
        aiFlags: results.aiFlags ? JSON.parse(JSON.stringify(results.aiFlags)) : null,
      },
    });
  }
}

// Export singleton instance
export const preScreeningService = new PreScreeningService();
