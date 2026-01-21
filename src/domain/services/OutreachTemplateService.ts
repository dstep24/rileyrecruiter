/**
 * Outreach Template Service
 *
 * Manages outreach message templates that follow the proven best practices
 * from our "Writing Effective Outreach" guidelines.
 *
 * Templates are stored in the database and can be:
 * - Created/edited by teleoperators
 * - Used by the AI Outreach Generator as a base
 * - Tracked for response rates to identify top performers
 *
 * Template placeholders use double-brace syntax: {{variableName}}
 * Available placeholders:
 * - {{candidateName}}, {{candidateFirstName}}
 * - {{currentTitle}}, {{currentCompany}}
 * - {{roleTitle}}, {{company}}, {{location}}
 * - {{arr}}, {{growthRate}}, {{funding}}, {{investors}}
 * - {{founderBackground}}, {{teamPedigree}}
 * - {{uniqueSelling}}, {{techStack}}
 * - {{recruiterName}}, {{recruiterTitle}}
 * - {{personalizedHook}} - AI-generated personalization
 */

import { prismaBase } from '../../infrastructure/database/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

export type OutreachCategory =
  | 'INITIAL_OUTREACH'
  | 'FOLLOW_UP_1'
  | 'FOLLOW_UP_2'
  | 'FOLLOW_UP_3'
  | 'REFERRAL_ASK'
  | 'RE_ENGAGEMENT'
  | 'WARM_INTRO'
  | 'POST_INTERVIEW';

export type TemplateChannel =
  | 'LINKEDIN_CONNECTION'
  | 'LINKEDIN_INMAIL'
  | 'EMAIL';

export interface CreateTemplateInput {
  tenantId: string;
  name: string;
  description?: string;
  category: OutreachCategory;
  channel: TemplateChannel;
  roleType?: string;
  subjectTemplate?: string;
  messageTemplate: string;
  brandVoice?: string;
  isDefault?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  subjectTemplate?: string;
  messageTemplate?: string;
  brandVoice?: string;
  isActive?: boolean;
  isDefault?: boolean;
}

export interface TemplateVariables {
  // Candidate info
  candidateName?: string;
  candidateFirstName?: string;
  currentTitle?: string;
  currentCompany?: string;
  // Role info
  roleTitle?: string;
  company?: string;
  location?: string;
  // Traction signals
  arr?: string;
  growthRate?: string;
  funding?: string;
  investors?: string;
  // Team pedigree
  founderBackground?: string;
  teamPedigree?: string;
  // Other
  uniqueSelling?: string;
  techStack?: string;
  recruiterName?: string;
  recruiterTitle?: string;
  personalizedHook?: string;
  // Custom variables
  [key: string]: string | undefined;
}

// =============================================================================
// SERVICE
// =============================================================================

export class OutreachTemplateService {
  private prisma = prismaBase;

  /**
   * Create a new outreach template
   */
  async createTemplate(input: CreateTemplateInput) {
    return this.prisma.outreachTemplate.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        category: input.category,
        channel: input.channel,
        roleType: input.roleType,
        subjectTemplate: input.subjectTemplate,
        messageTemplate: input.messageTemplate,
        brandVoice: input.brandVoice || 'professional-warm',
        isDefault: input.isDefault || false,
      },
    });
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string) {
    return this.prisma.outreachTemplate.findUnique({
      where: { id: templateId },
    });
  }

  /**
   * List templates for a tenant
   */
  async listTemplates(
    tenantId: string,
    options?: {
      category?: OutreachCategory;
      channel?: TemplateChannel;
      roleType?: string;
      activeOnly?: boolean;
    }
  ) {
    return this.prisma.outreachTemplate.findMany({
      where: {
        tenantId,
        ...(options?.category && { category: options.category }),
        ...(options?.channel && { channel: options.channel }),
        ...(options?.roleType && { roleType: options.roleType }),
        ...(options?.activeOnly && { isActive: true }),
      },
      orderBy: [{ isDefault: 'desc' }, { useCount: 'desc' }],
    });
  }

  /**
   * Get the default template for a category/channel combo
   */
  async getDefaultTemplate(
    tenantId: string,
    category: OutreachCategory,
    channel: TemplateChannel
  ) {
    return this.prisma.outreachTemplate.findFirst({
      where: {
        tenantId,
        category,
        channel,
        isDefault: true,
        isActive: true,
      },
    });
  }

  /**
   * Update a template
   */
  async updateTemplate(templateId: string, input: UpdateTemplateInput) {
    return this.prisma.outreachTemplate.update({
      where: { id: templateId },
      data: input,
    });
  }

  /**
   * Delete (soft-delete) a template
   */
  async deleteTemplate(templateId: string) {
    return this.prisma.outreachTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
  }

  /**
   * Increment use count for a template
   */
  async trackUsage(templateId: string) {
    return this.prisma.outreachTemplate.update({
      where: { id: templateId },
      data: { useCount: { increment: 1 } },
    });
  }

  /**
   * Update response rate for a template (call periodically with analytics)
   */
  async updateResponseRate(templateId: string, responseRate: number) {
    return this.prisma.outreachTemplate.update({
      where: { id: templateId },
      data: { responseRate },
    });
  }

  /**
   * Apply variables to a template, replacing {{placeholders}}
   */
  applyVariables(template: string, variables: TemplateVariables): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, value);
      }
    }

    // Remove any remaining unmatched placeholders
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result.trim();
  }

  /**
   * Seed default templates for a tenant (call during onboarding)
   */
  async seedDefaultTemplates(tenantId: string) {
    const defaultTemplates = getDefaultOutreachTemplates();

    for (const template of defaultTemplates) {
      // Check if already exists
      const existing = await this.prisma.outreachTemplate.findFirst({
        where: {
          tenantId,
          name: template.name,
          channel: template.channel,
        },
      });

      if (!existing) {
        await this.createTemplate({
          ...template,
          tenantId,
        });
      }
    }
  }
}

// =============================================================================
// DEFAULT TEMPLATES
// =============================================================================

/**
 * These templates follow the "Writing Effective Outreach" best practices:
 * - Strong subject lines with concrete numbers
 * - Make candidates feel exclusive
 * - Team credibility and traction signals
 * - Clear CTA + leave door open
 */
function getDefaultOutreachTemplates(): Omit<CreateTemplateInput, 'tenantId'>[] {
  return [
    // =========================================================================
    // LINKEDIN CONNECTION REQUESTS (300 char limit)
    // =========================================================================
    {
      name: 'High-Signal Connection Request',
      description: 'Best for when you have strong traction signals (ARR, funding, notable investors)',
      category: 'INITIAL_OUTREACH',
      channel: 'LINKEDIN_CONNECTION',
      roleType: 'engineering',
      messageTemplate: `{{candidateFirstName}} - {{personalizedHook}}

I'm working with {{company}} ({{arr}}, backed by {{investors}}) on their {{roleTitle}} search. You're one of a handful on my shortlist.

Worth a quick chat?`,
      isDefault: true,
    },
    {
      name: 'Team Pedigree Connection Request',
      description: 'Best when founder/team background is the main selling point',
      category: 'INITIAL_OUTREACH',
      channel: 'LINKEDIN_CONNECTION',
      roleType: 'engineering',
      messageTemplate: `{{candidateFirstName}} - Loved seeing {{personalizedHook}}.

Working with a startup founded by {{founderBackground}}. They're hiring {{roleTitle}} and you're on my shortlist.

Open to learning more?`,
      isDefault: false,
    },

    // =========================================================================
    // LINKEDIN INMAIL (1900 char limit)
    // =========================================================================
    {
      name: 'High-Converting InMail - Full Pitch',
      description: 'Complete InMail with traction signals, team pedigree, and clear CTA',
      category: 'INITIAL_OUTREACH',
      channel: 'LINKEDIN_INMAIL',
      roleType: 'engineering',
      subjectTemplate: '{{roleTitle}} | {{arr}} | {{investors}} backed',
      messageTemplate: `{{candidateFirstName}},

{{personalizedHook}}

I'm a talent partner working with {{company}}, a {{companyStage}} startup that just {{funding}} from {{investors}}. You're one of the few engineers that made my shortlist for this role.

{{company}} is building {{uniqueSelling}}, and they're hiring a {{roleTitle}} to join the core team{{location}}.

**Why {{company}} is different:**
- {{founderBackground}}
- {{teamPedigree}}
- {{growthRate}}

If you're excited by early-stage momentum, deep ownership, and working with proven builders — I'd love to share more.

Even if this one isn't the right fit, let's connect. I work with hundreds of roles as a talent partner, and I'm confident we can find something that matches your goals.

{{recruiterName}}`,
      isDefault: true,
    },
    {
      name: 'Concise InMail - Quick Pitch',
      description: 'Shorter InMail for when you want to be more direct',
      category: 'INITIAL_OUTREACH',
      channel: 'LINKEDIN_INMAIL',
      roleType: 'engineering',
      subjectTemplate: '{{roleTitle}} at {{company}} - You stood out',
      messageTemplate: `{{candidateFirstName}},

{{personalizedHook}} — that's exactly the experience {{company}} is looking for in their next {{roleTitle}}.

Quick context: {{company}} is {{companyStage}}, {{funding}}, and growing at {{growthRate}}. The founder {{founderBackground}}.

Would you be open to a 15-minute call this week to learn more? No pressure either way.

{{recruiterName}}`,
      isDefault: false,
    },

    // =========================================================================
    // FOLLOW-UP TEMPLATES
    // =========================================================================
    {
      name: 'Follow-Up #1 (3 days)',
      description: 'First follow-up - add new value, not pushy',
      category: 'FOLLOW_UP_1',
      channel: 'LINKEDIN_INMAIL',
      subjectTemplate: 'Quick follow-up: {{roleTitle}} at {{company}}',
      messageTemplate: `{{candidateFirstName}},

Wanted to bump this up — I know things get buried.

One thing I didn't mention: {{uniqueSelling}}

Still think you'd be a great fit. Worth 15 minutes?

{{recruiterName}}`,
      isDefault: true,
    },
    {
      name: 'Follow-Up #1 - Connection Request',
      description: 'Short follow-up for connection requests',
      category: 'FOLLOW_UP_1',
      channel: 'LINKEDIN_CONNECTION',
      messageTemplate: `{{candidateFirstName}} - Following up on my note about {{company}}. They're moving fast on the {{roleTitle}} role. Worth connecting?`,
      isDefault: true,
    },
    {
      name: 'Follow-Up #2 (7 days)',
      description: 'Second follow-up - different angle',
      category: 'FOLLOW_UP_2',
      channel: 'LINKEDIN_INMAIL',
      subjectTemplate: 'Last note on {{company}}',
      messageTemplate: `{{candidateFirstName}},

I'll keep this brief — I know you're busy.

If {{company}} isn't the right fit, I totally get it. But I'd still love to connect and learn what you ARE looking for. I have access to hundreds of opportunities and might have something better suited.

Either way, no hard feelings. Let me know.

{{recruiterName}}`,
      isDefault: true,
    },
    {
      name: 'Final Follow-Up (14 days)',
      description: 'Final follow-up - leave door open',
      category: 'FOLLOW_UP_3',
      channel: 'LINKEDIN_INMAIL',
      subjectTemplate: 'Closing the loop',
      messageTemplate: `{{candidateFirstName}},

I'll take silence as a no on {{company}} — totally fine!

If you're ever exploring new opportunities down the road, I'd be happy to reconnect. My door's always open.

Wishing you the best.

{{recruiterName}}`,
      isDefault: true,
    },

    // =========================================================================
    // REFERRAL ASK
    // =========================================================================
    {
      name: 'Referral Ask',
      description: 'Ask for referrals after they decline or are not a fit',
      category: 'REFERRAL_ASK',
      channel: 'LINKEDIN_INMAIL',
      subjectTemplate: 'Quick ask: Know anyone for {{roleTitle}}?',
      messageTemplate: `{{candidateFirstName}},

Thanks for getting back to me! Totally understand if the timing isn't right.

Quick question: Do you know anyone in your network who might be a great fit for the {{roleTitle}} role at {{company}}? We offer a $5K referral bonus for successful hires.

No pressure — just thought I'd ask. Either way, let's stay connected!

{{recruiterName}}`,
      isDefault: true,
    },

    // =========================================================================
    // EMAIL TEMPLATES
    // =========================================================================
    {
      name: 'Full Email Pitch',
      description: 'Complete email outreach with all details',
      category: 'INITIAL_OUTREACH',
      channel: 'EMAIL',
      roleType: 'engineering',
      subjectTemplate: '{{roleTitle}} | {{arr}} | {{funding}} from {{investors}}',
      messageTemplate: `Hi {{candidateFirstName}},

{{personalizedHook}}

I'm reaching out because I'm working with {{company}}, a fast-growing startup that just {{funding}} from {{investors}}. You're one of the few engineers on my shortlist for their {{roleTitle}} role.

**About {{company}}:**
{{company}} is building {{uniqueSelling}}. They're currently at {{arr}} and growing at {{growthRate}}.

**Why This Might Be Interesting:**
- You'd be joining a team led by {{founderBackground}}
- {{teamPedigree}}
- Tech stack: {{techStack}}
- Location: {{location}}

If this sounds interesting, I'd love to set up a quick 15-minute call to share more details. And if the timing isn't right or this isn't a fit, I'd still love to connect — I work with hundreds of roles and might have something better suited to what you're looking for.

Let me know either way!

Best,
{{recruiterName}}
{{recruiterTitle}}

P.S. If you know anyone who might be a great fit, we offer a $5K referral bonus for successful hires.`,
      isDefault: true,
    },
  ];
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let serviceInstance: OutreachTemplateService | null = null;

export function getOutreachTemplateService(): OutreachTemplateService {
  if (!serviceInstance) {
    serviceInstance = new OutreachTemplateService();
  }
  return serviceInstance;
}

export const outreachTemplateService = getOutreachTemplateService();
