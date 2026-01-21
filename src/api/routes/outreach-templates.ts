/**
 * Outreach Template API Routes
 *
 * Manages outreach message templates that follow best practices for high-converting
 * recruiting outreach. Templates are stored in the database and can be:
 * - Listed and filtered by category/channel/role type
 * - Created with custom content
 * - Updated and versioned
 * - Tracked for response rates
 * - Seeded with defaults during tenant onboarding
 */

import { Router, Request, Response } from 'express';
import {
  outreachTemplateService,
  type OutreachCategory,
  type TemplateChannel,
} from '../../domain/services/index.js';

const router = Router();

// =============================================================================
// TEMPLATE MANAGEMENT
// =============================================================================

/**
 * List all outreach templates for a tenant
 * GET /api/outreach-templates
 *
 * Query params:
 * - tenantId: string (defaults to 'development')
 * - category: OutreachCategory (optional filter)
 * - channel: TemplateChannel (optional filter)
 * - roleType: string (optional filter)
 * - activeOnly: 'true' to filter active only
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || 'development';
    const category = req.query.category as OutreachCategory | undefined;
    const channel = req.query.channel as TemplateChannel | undefined;
    const roleType = req.query.roleType as string | undefined;
    const activeOnly = req.query.activeOnly === 'true';

    const templates = await outreachTemplateService.listTemplates(tenantId, {
      category,
      channel,
      roleType,
      activeOnly,
    });

    res.json({ success: true, templates });
  } catch (error) {
    console.error('[OutreachTemplates] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to list templates' });
  }
});

/**
 * Get a single template by ID
 * GET /api/outreach-templates/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const template = await outreachTemplateService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, template });
  } catch (error) {
    console.error('[OutreachTemplates] Get error:', error);
    res.status(500).json({ success: false, error: 'Failed to get template' });
  }
});

/**
 * Get default template for a category/channel combo
 * GET /api/outreach-templates/default/:category/:channel
 */
router.get('/default/:category/:channel', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenantId as string) || 'development';
    const category = (Array.isArray(req.params.category) ? req.params.category[0] : req.params.category) as OutreachCategory;
    const channel = (Array.isArray(req.params.channel) ? req.params.channel[0] : req.params.channel) as TemplateChannel;

    const template = await outreachTemplateService.getDefaultTemplate(
      tenantId,
      category,
      channel
    );

    if (!template) {
      return res.json({ success: true, template: null, message: 'No default template found' });
    }

    res.json({ success: true, template });
  } catch (error) {
    console.error('[OutreachTemplates] Get default error:', error);
    res.status(500).json({ success: false, error: 'Failed to get default template' });
  }
});

/**
 * Create a new template
 * POST /api/outreach-templates
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      tenantId = 'development',
      name,
      description,
      category,
      channel,
      roleType,
      subjectTemplate,
      messageTemplate,
      brandVoice,
      isDefault,
    } = req.body as {
      tenantId?: string;
      name: string;
      description?: string;
      category: OutreachCategory;
      channel: TemplateChannel;
      roleType?: string;
      subjectTemplate?: string;
      messageTemplate: string;
      brandVoice?: string;
      isDefault?: boolean;
    };

    if (!name || !category || !channel || !messageTemplate) {
      return res.status(400).json({
        success: false,
        error: 'name, category, channel, and messageTemplate are required',
      });
    }

    const template = await outreachTemplateService.createTemplate({
      tenantId,
      name,
      description,
      category,
      channel,
      roleType,
      subjectTemplate,
      messageTemplate,
      brandVoice,
      isDefault,
    });

    res.json({ success: true, template });
  } catch (error) {
    console.error('[OutreachTemplates] Create error:', error);
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

/**
 * Update a template
 * PUT /api/outreach-templates/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const {
      name,
      description,
      subjectTemplate,
      messageTemplate,
      brandVoice,
      isActive,
      isDefault,
    } = req.body as {
      name?: string;
      description?: string;
      subjectTemplate?: string;
      messageTemplate?: string;
      brandVoice?: string;
      isActive?: boolean;
      isDefault?: boolean;
    };

    const template = await outreachTemplateService.updateTemplate(templateId, {
      name,
      description,
      subjectTemplate,
      messageTemplate,
      brandVoice,
      isActive,
      isDefault,
    });

    res.json({ success: true, template });
  } catch (error) {
    console.error('[OutreachTemplates] Update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

/**
 * Delete (soft-delete) a template
 * DELETE /api/outreach-templates/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await outreachTemplateService.deleteTemplate(templateId);
    res.json({ success: true });
  } catch (error) {
    console.error('[OutreachTemplates] Delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

/**
 * Seed default templates for a tenant
 * POST /api/outreach-templates/seed
 */
router.post('/seed', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.body.tenantId as string) || 'development';

    await outreachTemplateService.seedDefaultTemplates(tenantId);

    res.json({
      success: true,
      message: `Default templates seeded for tenant: ${tenantId}`,
    });
  } catch (error) {
    console.error('[OutreachTemplates] Seed error:', error);
    res.status(500).json({ success: false, error: 'Failed to seed templates' });
  }
});

/**
 * Preview a template with variables applied
 * POST /api/outreach-templates/:id/preview
 */
router.post('/:id/preview', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const variables = req.body.variables as Record<string, string>;

    const template = await outreachTemplateService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const previewMessage = outreachTemplateService.applyVariables(
      template.messageTemplate,
      variables
    );

    const previewSubject = template.subjectTemplate
      ? outreachTemplateService.applyVariables(template.subjectTemplate, variables)
      : undefined;

    res.json({
      success: true,
      preview: {
        subject: previewSubject,
        message: previewMessage,
        charCount: previewMessage.length,
      },
    });
  } catch (error) {
    console.error('[OutreachTemplates] Preview error:', error);
    res.status(500).json({ success: false, error: 'Failed to preview template' });
  }
});

/**
 * Track template usage
 * POST /api/outreach-templates/:id/track-usage
 */
router.post('/:id/track-usage', async (req: Request, res: Response) => {
  try {
    const templateId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await outreachTemplateService.trackUsage(templateId);
    res.json({ success: true });
  } catch (error) {
    console.error('[OutreachTemplates] Track usage error:', error);
    res.status(500).json({ success: false, error: 'Failed to track usage' });
  }
});

/**
 * Get available placeholder variables and their descriptions
 * GET /api/outreach-templates/variables
 */
router.get('/meta/variables', async (_req: Request, res: Response) => {
  res.json({
    success: true,
    variables: {
      // Candidate info
      candidateName: 'Full name of the candidate',
      candidateFirstName: 'First name only',
      currentTitle: 'Current job title',
      currentCompany: 'Current employer',
      // Role info
      roleTitle: 'Title of the open position',
      company: 'Hiring company name',
      companyStage: 'Company stage (Seed, Series A, etc.)',
      location: 'Job location',
      // Traction signals
      arr: 'Annual recurring revenue (e.g., "$25M ARR")',
      growthRate: 'Growth metrics (e.g., "50% MoM")',
      funding: 'Recent funding (e.g., "just raised $15M Series A")',
      investors: 'Notable investors (e.g., "a16z, Sequoia")',
      // Team pedigree
      founderBackground: 'Founder credentials (e.g., "founding engineer at Figma")',
      teamPedigree: 'Team highlights (e.g., "ex-Stripe, led 2 exits")',
      // Other
      uniqueSelling: 'What makes this company different',
      techStack: 'Technology stack',
      recruiterName: 'Recruiter name for signature',
      recruiterTitle: 'Recruiter title',
      personalizedHook: 'AI-generated personalized opener based on candidate profile',
    },
  });
});

export default router;
