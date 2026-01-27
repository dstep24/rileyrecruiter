/**
 * LinkedIn Integration Module
 *
 * Candidate sourcing and messaging via LinkedIn:
 * - Profile search and viewing
 * - InMail and connection requests
 * - Rate limit management
 * - Open to Work detection
 *
 * Supports multiple providers:
 * - Unipile (primary)
 * - Official RSC (partner only)
 * - Phantombuster (automation)
 */

// Runtime exports (classes and functions)
export {
  LinkedInClient,
  initializeLinkedInClient,
  getLinkedInClient,
} from './LinkedInClient.js';

// Type-only exports from LinkedInClient
export type {
  LinkedInConfig,
  RateLimits,
  LinkedInProfile,
  LinkedInExperience,
  LinkedInEducation,
  LinkedInSearchQuery,
  LinkedInSearchResult,
  LinkedInMessage,
  LinkedInConversation,
  SendMessageRequest,
  ConnectionRequest,
} from './LinkedInClient.js';

// Runtime exports (classes and functions)
export {
  UnipileClient,
  unipileToLinkedInProfile,
  initializeUnipileClient,
  getUnipileClient,
} from './UnipileClient.js';

// Type-only exports from UnipileClient
export type {
  UnipileConfig,
  UnipileSearchParams,
  UnipileSearchResult,
  UnipileProfile,
  UnipileExperience,
  UnipileEducation,
  UnipileMessage,
  UnipileChat,
  UnipileSkillFilter,
  UnipileRoleFilter,
  UnipileParameterType,
  UnipileParameterResult,
  UnipileSearchApi,
  UnipileSearchCategory,
} from './UnipileClient.js';
