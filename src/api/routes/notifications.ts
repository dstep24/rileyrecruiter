/**
 * Notifications API Routes
 *
 * Provides REST endpoints and Server-Sent Events (SSE) for real-time
 * notification delivery to the dashboard.
 *
 * SSE endpoints allow the frontend to receive notifications in real-time
 * without polling, which is especially useful for escalations.
 */

import { Router, Request, Response } from 'express';
import {
  getNotificationService,
  notificationEvents,
  type Notification,
  type NotificationType,
} from '../../domain/services/NotificationService.js';

const router = Router();

// Helper to get string from query param
function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

// =============================================================================
// REST ENDPOINTS
// =============================================================================

/**
 * GET /api/notifications - List all notifications
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';
    const limit = parseInt(getQueryString(req.query.limit) || '50');
    const type = getQueryString(req.query.type) as NotificationType | undefined;

    const service = getNotificationService(tenantId);

    let notifications: Notification[];
    if (type) {
      notifications = await service.getByType(type, limit);
    } else {
      notifications = await service.getAll(limit);
    }

    return res.json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    console.error('[Notifications API] Error listing notifications:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list notifications',
    });
  }
});

/**
 * GET /api/notifications/unread - Get unread notifications
 */
router.get('/unread', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';

    const service = getNotificationService(tenantId);
    const notifications = await service.getUnread();

    return res.json({
      success: true,
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    console.error('[Notifications API] Error getting unread notifications:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get unread notifications',
    });
  }
});

/**
 * GET /api/notifications/count - Get unread count
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';

    const service = getNotificationService(tenantId);
    const count = await service.getUnreadCount();

    return res.json({
      success: true,
      unreadCount: count,
    });
  } catch (error) {
    console.error('[Notifications API] Error getting count:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get notification count',
    });
  }
});

/**
 * POST /api/notifications/:id/read - Mark notification as read
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';
    const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const service = getNotificationService(tenantId);
    const notification = await service.markRead(notificationId);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    return res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error('[Notifications API] Error marking as read:', error);
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
    const tenantId = getQueryString(req.query.tenantId) || 'development';

    const service = getNotificationService(tenantId);
    const count = await service.markAllRead();

    return res.json({
      success: true,
      markedCount: count,
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
    const tenantId = getQueryString(req.query.tenantId) || 'development';
    const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const service = getNotificationService(tenantId);
    const deleted = await service.delete(notificationId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Notifications API] Error deleting notification:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete notification',
    });
  }
});

// =============================================================================
// SERVER-SENT EVENTS (SSE) ENDPOINTS
// =============================================================================

/**
 * GET /api/notifications/stream - SSE endpoint for real-time notifications
 *
 * Clients can connect to this endpoint to receive notifications in real-time.
 * Events are sent in the standard SSE format:
 *   event: notification
 *   data: {"id":"...","type":"...","title":"..."}
 *
 * Usage:
 *   const eventSource = new EventSource('/api/notifications/stream?tenantId=development');
 *   eventSource.addEventListener('notification', (e) => {
 *     const notification = JSON.parse(e.data);
 *     console.log('New notification:', notification);
 *   });
 */
router.get('/stream', (req: Request, res: Response) => {
  const tenantId = getQueryString(req.query.tenantId) || 'development';

  console.log('[Notifications SSE] Client connected for tenant:', tenantId);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  res.write('event: connected\ndata: ' + JSON.stringify({ tenantId, timestamp: new Date().toISOString() }) + '\n\n');

  // Handler for notifications
  const notificationHandler = (notification: Notification) => {
    res.write('event: notification\ndata: ' + JSON.stringify(notification) + '\n\n');
  };

  // Handler for escalations (high priority)
  const escalationHandler = (notification: Notification) => {
    res.write('event: escalation\ndata: ' + JSON.stringify(notification) + '\n\n');
  };

  // Subscribe to events for this tenant
  notificationEvents.on('notification:' + tenantId, notificationHandler);
  notificationEvents.on('escalation:' + tenantId, escalationHandler);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write('event: heartbeat\ndata: ' + JSON.stringify({ timestamp: new Date().toISOString() }) + '\n\n');
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    console.log('[Notifications SSE] Client disconnected for tenant:', tenantId);
    notificationEvents.off('notification:' + tenantId, notificationHandler);
    notificationEvents.off('escalation:' + tenantId, escalationHandler);
    clearInterval(heartbeatInterval);
  });
});

/**
 * GET /api/notifications/stream/escalations - SSE endpoint for escalations only
 *
 * A dedicated stream for high-priority escalation notifications.
 * Useful if the frontend wants a separate channel for urgent notifications.
 */
router.get('/stream/escalations', (req: Request, res: Response) => {
  const tenantId = getQueryString(req.query.tenantId) || 'development';

  console.log('[Notifications SSE] Escalations client connected for tenant:', tenantId);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial connection event
  res.write('event: connected\ndata: ' + JSON.stringify({ tenantId, type: 'escalations', timestamp: new Date().toISOString() }) + '\n\n');

  // Handler for escalations
  const escalationHandler = (notification: Notification) => {
    res.write('event: escalation\ndata: ' + JSON.stringify(notification) + '\n\n');
  };

  // Subscribe to escalation events
  notificationEvents.on('escalation:' + tenantId, escalationHandler);

  // Send heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    res.write('event: heartbeat\ndata: ' + JSON.stringify({ timestamp: new Date().toISOString() }) + '\n\n');
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    console.log('[Notifications SSE] Escalations client disconnected for tenant:', tenantId);
    notificationEvents.off('escalation:' + tenantId, escalationHandler);
    clearInterval(heartbeatInterval);
  });
});

export default router;
