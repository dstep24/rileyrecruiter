/**
 * Slack Integration Module
 *
 * Provides Slack bot capabilities for:
 * - Quick approval notifications
 * - Urgent escalation alerts
 * - Inline approve/reject actions
 * - Daily summary reports
 */

export {
  SlackBot,
  SlackConfig,
  SlackMessage,
  SlackInteraction,
  initializeSlackBot,
  getSlackBot,
  createSlackRoutes,
} from './SlackBot.js';
