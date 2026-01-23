/**
 * Settings Routes
 *
 * Provides settings configuration for the dashboard
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /settings - Get application settings
 */
router.get('/', async (req: Request, res: Response) => {
  // In production, this would fetch from database using tenant ID
  // For now, return default settings structure
  res.json({
    data: {
      general: {
        tenantName: 'Riley Recruiter',
        timezone: 'America/Los_Angeles',
        workingHours: { start: '09:00', end: '17:00' },
        weekendsEnabled: false,
      },
      notifications: {
        emailAlerts: true,
        slackAlerts: false,
        urgentOnly: false,
        digestFrequency: 'daily',
      },
      autonomy: {
        level: 'SUPERVISED',
        approvalRequired: ['SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SCHEDULE_INTERVIEW'],
        autoApprove: ['FOLLOW_UP_REMINDER'],
        autopilotMode: false,
      },
      integrations: {
        ats: { connected: false, provider: '' },
        email: { connected: false, provider: '' },
        calendar: { connected: false, provider: '' },
        linkedin: { connected: false },
        github: { connected: false },
      },
    },
  });
});

/**
 * PUT /settings - Update application settings
 */
router.put('/', async (req: Request, res: Response) => {
  // In production, this would save to database
  // For now, just echo back the settings
  res.json({
    data: req.body,
    message: 'Settings updated successfully',
  });
});

/**
 * PATCH /settings/:section - Update a specific settings section
 */
router.patch('/:section', async (req: Request, res: Response) => {
  const section = req.params.section as string;
  const validSections = ['general', 'notifications', 'autonomy', 'integrations'];

  if (!validSections.includes(section)) {
    res.status(400).json({
      error: `Invalid section: ${section}. Valid sections are: ${validSections.join(', ')}`,
    });
    return;
  }

  // In production, this would save to database
  const responseData: Record<string, unknown> = { [section]: req.body };
  res.json({
    data: responseData,
    message: `${section} settings updated successfully`,
  });
});

export default router;
