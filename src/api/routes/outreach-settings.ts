/**
 * Outreach Settings Routes
 *
 * API endpoints for managing outreach automation settings.
 * Controls Autopilot Mode and other outreach configuration.
 */

import { Router, Request, Response } from 'express';
import { outreachSettingsService } from '../../domain/services/OutreachSettingsService.js';

const router = Router();

// Helper to get string from query param
function getQueryString(value: unknown, defaultValue: string): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return defaultValue;
}

/**
 * GET /api/outreach-settings - Get current outreach settings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const settings = outreachSettingsService.getSettings(tenantId);

    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('[Outreach Settings] Error fetching settings:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch settings',
    });
  }
});

/**
 * PUT /api/outreach-settings - Update outreach settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const updates = req.body;

    const settings = outreachSettingsService.updateSettings(tenantId, updates);

    return res.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('[Outreach Settings] Error updating settings:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update settings',
    });
  }
});

/**
 * POST /api/outreach-settings/autopilot - Toggle autopilot mode
 */
router.post('/autopilot', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    outreachSettingsService.setAutopilotMode(enabled, tenantId);

    console.log(`[Outreach Settings] Autopilot mode ${enabled ? 'ENABLED' : 'DISABLED'} for tenant ${tenantId}`);

    return res.json({
      success: true,
      autopilotMode: enabled,
      message: enabled
        ? 'Autopilot enabled - pitches will be sent automatically when connections are accepted'
        : 'Autopilot disabled - all pitches require manual approval',
    });
  } catch (error) {
    console.error('[Outreach Settings] Error toggling autopilot:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to toggle autopilot',
    });
  }
});

/**
 * GET /api/outreach-settings/autopilot - Get autopilot status
 */
router.get('/autopilot', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const enabled = outreachSettingsService.isAutopilotEnabled(tenantId);

    return res.json({
      success: true,
      autopilotMode: enabled,
    });
  } catch (error) {
    console.error('[Outreach Settings] Error fetching autopilot status:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch autopilot status',
    });
  }
});

export default router;
