/**
 * GitHub Integration Module
 *
 * Provides GitHub API integration for candidate sourcing:
 * - Search developers by language, location, skills
 * - Extract contact emails from profiles and commits
 * - Get contribution statistics and activity
 *
 * Features:
 * - Rate limit aware (5,000 requests/hour, 30 search/minute)
 * - Email extraction from profile + commit history
 * - Async iteration for large result sets
 */

// Types
export type {
  GitHubConfig,
  GitHubSearchQuery,
  GitHubSearchResult,
  GitHubUser,
  GitHubProfile,
  GitHubRepo,
  GitHubCommit,
  ContributionStats,
  LanguageStat,
  GitHubCandidate,
  EmailExtractionResult,
  ExtractedEmail,
} from './types.js';

// Client
export {
  GitHubClient,
  initializeGitHubClient,
  getGitHubClient,
  isGitHubConfigured,
  initializeGitHubClientFromEnv,
} from './GitHubClient.js';

// Email Extractor
export {
  EmailExtractor,
  getEmailExtractor,
  initializeEmailExtractor,
} from './EmailExtractor.js';
