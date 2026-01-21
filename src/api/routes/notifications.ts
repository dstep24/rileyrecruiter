/**
 * Notifications Routes
 *
 * API endpoints for managing in-app notifications.
 * Used to alert recruiters about connection acceptances, pitch sends, candidate replies, etc.
 */

import { Router, Request, Response } from 'express';
import { getNotificationService } from '../../domain/services/NotificationService.js';

const router = Router();

// Helper to get string from query param (handles string | string[] | undefined)
function getQueryString(value: unknown, defaultValue: string): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return defaultValue;
}

/**
 * GET /api/notifications - Get all notifications
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const limit = parseInt(getQueryString(req.query.limit, '50'));

    const notificationService = getNotificationService(tenantId);
    const notifications = await notificationService.getAll(limit);

    return res.json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    console.error('[Notifications API] Error fetching notifications:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch notifications',
    });
  }
});

/**
 * GET /api/notifications/unread - Get unread notifications
 */
router.get('/unread', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');

    const notificationService = getNotificationService(tenantId);
    const notifications = await notificationService.getUnread();
    const count = notifications.length;

    return res.json({
      success: true,
      notifications,
      count,
    });
  } catch (error) {
    console.error('[Notifications API] Error fetching unread notifications:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch unread notifications',
    });
  }
});

/**
 * GET /api/notifications/count - Get unread count only
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');

    const notificationService = getNotificationService(tenantId);
    const count = await notificationService.getUnreadCount();

    return res.json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('[Notifications API] Error fetching notification count:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch notification count',
    });
  }
});

/**
 * POST /api/notifications/:id/read - Mark notification as read
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const notificationId = req.params.id as string;

    const notificationService = getNotificationService(tenantId);
    const notification = await notificationService.markRead(notificationId);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error('[Notifications API] Error marking notification as read:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to mark notification as read',
    });
  }
});

/**
 * POST /api/notifications/read-all - Mark all notifications as read
 */
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');

    const notificationService = getNotificationService(tenantId);
    const count = await notificationService.markAllRead();

    return res.json({
      success: true,
      markedRead: count,
    });
  } catch (error) {
    console.error('[Notifications API] Error marking all as read:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to mark all as read',
    });
  }
});

/**
 * DELETE /api/notifications/:id - Delete a notification
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');
    const notificationId = req.params.id as string;

    const notificationService = getNotificationService(tenantId);
    const deleted = await notificationService.delete(notificationId);

    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    console.error('[Notifications API] Error deleting notification:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete notification',
    });
  }
});

/**
 * DELETE /api/notifications - Clear all notifications
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId, 'development');

    const notificationService = getNotificationService(tenantId);
    const count = await notificationService.clearAll();

    return res.json({
      success: true,
      cleared: count,
    });
  } catch (error) {
    console.error('[Notifications API] Error clearing notifications:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to clear notifications',
    });
  }
});

export default router;
