/**
 * Assessment API Routes
 *
 * Handles pre-screening assessment templates, links, and responses
 */

import { Router, Request, Response } from 'express';
import {
  preScreeningService,
  type CreateTemplateInput,
  type CreateQuestionInput,
} from '../../domain/services/PreScreeningService.js';
import { assessmentScorer, type ScoringContext } from '../../domain/services/AssessmentScorer.js';
import type { QuestionType } from '../../generated/prisma/index.js';

const router = Router();

// =============================================================================
// TEMPLATE MANAGEMENT (Authenticated)
// =============================================================================

/**
 * Create a new assessment template
 * POST /api/assessments/templates
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { tenantId, name, description, roleType, questions } = req.body as {
      tenantId?: string;
      name: string;
      description?: string;
      roleType?: string;
      questions: {
        questionText: string;
        questionType: QuestionType;
        options?: string[];
        isRequired?: boolean;
        scoringWeight?: number;
        idealAnswer?: string;
      }[];
    };

    // Use development tenant if not specified
    const effectiveTenantId = tenantId || 'development';

    if (!name || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name and at least one question are required',
      });
    }

    const template = await preScreeningService.createTemplate({
      tenantId: effectiveTenantId,
      name,
      description,
      roleType,
      questions: questions.map((q) => ({
        questionText: q.questionText,
        questionType: q.questionType || 'TEXT',
        options: q.options,
        isRequired: q.isRequired ?? true,
        scoringWeight: q.scoringWeight ?? 1,
        idealAnswer: q.idealAnswer,
      })),
    });

    res.json({ success: true, template });
  } catch (error) {
    console.error('[Assessments] Create template error:', error);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

/**
 * List all templates for a tenant
 * GET /api/assessments/templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || 'development';
    const activeOnly = req.query.activeOnly === 'true';

    const templates = await preScreeningService.listTemplates(tenantId, { activeOnly });

    res.json({ success: true, templates });
  } catch (error) {
    console.error('[Assessments] List templates error:', error);
    res.status(500).json({ success: false, error: 'Failed to list templates' });
  }
});

/**
 * Get a template by ID
 * GET /api/assessments/templates/:id
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const template = await preScreeningService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, template });
  } catch (error) {
    console.error('[Assessments] Get template error:', error);
    res.status(500).json({ success: false, error: 'Failed to get template' });
  }
});

/**
 * Update a template
 * PUT /api/assessments/templates/:id
 */
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, roleType, isActive } = req.body as {
      name?: string;
      description?: string;
      roleType?: string;
      isActive?: boolean;
    };

    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const template = await preScreeningService.updateTemplate(templateId, {
      name,
      description,
      roleType,
      isActive,
    });

    res.json({ success: true, template });
  } catch (error) {
    console.error('[Assessments] Update template error:', error);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

/**
 * Delete a template (soft delete)
 * DELETE /api/assessments/templates/:id
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await preScreeningService.deleteTemplate(templateId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Assessments] Delete template error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// =============================================================================
// ASSESSMENT LINK GENERATION (Authenticated)
// =============================================================================

/**
 * Create an assessment link for a candidate
 * POST /api/assessments/send
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { templateId, conversationId, candidateName, candidateEmail, expiresInDays } = req.body as {
      templateId: string;
      conversationId: string;
      candidateName?: string;
      candidateEmail?: string;
      expiresInDays?: number;
    };

    if (!templateId || !conversationId) {
      return res.status(400).json({
        success: false,
        error: 'templateId and conversationId are required',
      });
    }

    const result = await preScreeningService.createAssessmentLink({
      templateId,
      conversationId,
      candidateName,
      candidateEmail,
      expiresInDays,
    });

    res.json({
      success: true,
      assessmentLink: result,
    });
  } catch (error) {
    console.error('[Assessments] Create link error:', error);
    res.status(500).json({ success: false, error: 'Failed to create assessment link' });
  }
});

/**
 * List all responses for a template
 * GET /api/assessments/responses
 */
router.get('/responses', async (req: Request, res: Response) => {
  try {
    const templateId = req.query.templateId as string;
    const status = req.query.status as string | undefined;

    if (!templateId) {
      return res.status(400).json({ success: false, error: 'templateId is required' });
    }

    const responses = await preScreeningService.listResponses(templateId, {
      status: status as 'PENDING' | 'STARTED' | 'COMPLETED' | 'EXPIRED' | undefined,
    });

    res.json({ success: true, responses });
  } catch (error) {
    console.error('[Assessments] List responses error:', error);
    res.status(500).json({ success: false, error: 'Failed to list responses' });
  }
});

/**
 * Get assessment result by response ID
 * GET /api/assessments/responses/:id
 */
router.get('/responses/:id', async (req: Request, res: Response) => {
  try {
    const responseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await preScreeningService.getAssessmentById(responseId);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Response not found' });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Assessments] Get response error:', error);
    res.status(500).json({ success: false, error: 'Failed to get response' });
  }
});

/**
 * Get assessment for a conversation
 * GET /api/assessments/conversation/:conversationId
 */
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
    const result = await preScreeningService.getAssessmentForConversation(conversationId);

    if (!result) {
      return res.json({ success: true, assessment: null });
    }

    res.json({ success: true, assessment: result });
  } catch (error) {
    console.error('[Assessments] Get conversation assessment error:', error);
    res.status(500).json({ success: false, error: 'Failed to get assessment' });
  }
});

// =============================================================================
// AI SCORING (Authenticated)
// =============================================================================

/**
 * Score a completed assessment
 * POST /api/assessments/score/:responseId
 */
router.post('/score/:responseId', async (req: Request, res: Response) => {
  try {
    const context = req.body as ScoringContext | undefined;
    const responseId = Array.isArray(req.params.responseId) ? req.params.responseId[0] : req.params.responseId;

    const result = await assessmentScorer.scoreAssessment(responseId, context);

    res.json({ success: true, scoring: result });
  } catch (error) {
    console.error('[Assessments] Score error:', error);
    res.status(500).json({ success: false, error: 'Failed to score assessment' });
  }
});

/**
 * Score assessment by conversation ID
 * POST /api/assessments/score-conversation/:conversationId
 */
router.post('/score-conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const context = req.body as ScoringContext | undefined;
    const conversationId = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;

    const result = await assessmentScorer.scoreByConversation(conversationId, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'No completed assessment found for this conversation',
      });
    }

    res.json({ success: true, scoring: result });
  } catch (error) {
    console.error('[Assessments] Score conversation error:', error);
    res.status(500).json({ success: false, error: 'Failed to score assessment' });
  }
});

// =============================================================================
// PUBLIC ENDPOINTS (No auth required, JWT-secured)
// =============================================================================

/**
 * Get assessment form by token (public)
 * GET /api/public/assessment/:token
 */
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const formData = await preScreeningService.getAssessmentForm(token);

    if (!formData) {
      return res.status(404).json({
        success: false,
        error: 'Assessment not found, expired, or already completed',
      });
    }

    res.json({ success: true, form: formData });
  } catch (error) {
    console.error('[Assessments] Get form error:', error);
    res.status(500).json({ success: false, error: 'Failed to get assessment form' });
  }
});

/**
 * Submit assessment answers (public)
 * POST /api/public/assessment/:token
 */
router.post('/public/:token', async (req: Request, res: Response) => {
  try {
    const { answers, candidateName, candidateEmail } = req.body as {
      answers: {
        questionId: string;
        answerText: string;
        answerValue?: unknown;
      }[];
      candidateName?: string;
      candidateEmail?: string;
    };

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Answers are required',
      });
    }

    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const result = await preScreeningService.submitAnswers({
      accessToken: token,
      answers,
      candidateName,
      candidateEmail,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Trigger async scoring (don't wait for it)
    if (result.responseId) {
      assessmentScorer.scoreAssessment(result.responseId).catch((err) => {
        console.error('[Assessments] Async scoring error:', err);
      });
    }

    res.json({
      success: true,
      message: 'Assessment submitted successfully',
      responseId: result.responseId,
    });
  } catch (error) {
    console.error('[Assessments] Submit error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit assessment' });
  }
});

export default router;
