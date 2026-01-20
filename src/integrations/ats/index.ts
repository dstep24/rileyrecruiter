/**
 * ATS Integration Module
 *
 * Unified interface for Applicant Tracking Systems:
 * - Greenhouse, Lever, Ashby, Workday, etc.
 * - Bidirectional candidate sync
 * - Pipeline stage management
 * - Activity and scorecard tracking
 */

export {
  ATSClient,
  ATSConfig,
  ATSType,
  ATSCandidate,
  ATSApplication,
  ATSJob,
  ATSStage,
  ATSUser,
  ATSActivity,
  ATSScorecard,
  ATSWebhookEvent,
  initializeATSClient,
  getATSClient,
} from './ATSClient.js';
