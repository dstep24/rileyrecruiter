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

export {
  LinkedInClient,
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
  initializeLinkedInClient,
  getLinkedInClient,
} from './LinkedInClient.js';

export {
  UnipileClient,
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
  unipileToLinkedInProfile,
  initializeUnipileClient,
  getUnipileClient,
} from './UnipileClient.js';
