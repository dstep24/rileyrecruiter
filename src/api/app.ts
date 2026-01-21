/**
 * Express Application - Riley Recruiter API
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRoutes, taskRoutes, sourcingRoutes } from './routes/index.js';
import actionsRoutes from './routes/actions.js';
import analyticsRoutes from './routes/analytics.js'; // Real analytics from database
import coreApiRoutes from './routes/demo.js'; // Demo/sandbox routes for testing
import webhooksRoutes from './routes/webhooks.js'; // Webhook handlers for external services
import assessmentsRoutes from './routes/assessments.js'; // Pre-screening assessment routes
import outreachTemplatesRoutes from './routes/outreach-templates.js'; // Outreach template management
import outreachRoutes from './routes/outreach.js'; // Outreach tracking routes
import outreachSettingsRoutes from './routes/outreach-settings.js'; // Outreach settings (autopilot, etc.)
import notificationsRoutes from './routes/notifications.js'; // Notification routes
import calendlyRoutes from './routes/calendly.js'; // Calendly link rotation routes

// =============================================================================
// CREATE APP
// =============================================================================

export function createApp() {
  const app = express();

  // ===========================================================================
  // GLOBAL MIDDLEWARE
  // ===========================================================================

  // Security headers
  app.use(helmet());

  // CORS
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Request-Id', 'X-Anthropic-Api-Key'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request ID
  app.use((req, _res, next) => {
    if (!req.headers['x-request-id']) {
      req.headers['x-request-id'] = crypto.randomUUID();
    }
    next();
  });

  // ===========================================================================
  // PUBLIC ROUTES (no tenant required)
  // ===========================================================================

  // Health checks
  app.use('/health', healthRoutes);

  // ===========================================================================
  // WEBHOOKS (no tenant required - external services call these)
  // ===========================================================================

  app.use('/webhooks', webhooksRoutes);

  // ===========================================================================
  // TENANT-SCOPED ROUTES
  // ===========================================================================

  // Apply tenant middleware to all /api routes
  app.use('/api', tenantMiddleware());

  // Tasks API
  app.use('/api/tasks', taskRoutes);

  // Actions API (triggers)
  app.use('/api/actions', actionsRoutes);

  // Sourcing API (LinkedIn search)
  app.use('/api/sourcing', sourcingRoutes);

  // Assessments API (pre-screening)
  app.use('/api/assessments', assessmentsRoutes);

  // Outreach Templates API
  app.use('/api/outreach-templates', outreachTemplatesRoutes);

  // Outreach Tracking API
  app.use('/api/outreach', outreachRoutes);

  // Outreach Settings API (autopilot mode, etc.)
  app.use('/api/outreach-settings', outreachSettingsRoutes);

  // Notifications API
  app.use('/api/notifications', notificationsRoutes);

  // Calendly Link Rotation API
  app.use('/api/calendly', calendlyRoutes);

  // Analytics API (real metrics from database)
  app.use('/api/analytics', analyticsRoutes);

  // ===========================================================================
  // DEMO/SANDBOX ROUTES (for testing without real data)
  // These provide fallback data when real data isn't available
  // ===========================================================================

  app.use('/api/demo', coreApiRoutes);

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}

export default createApp;
