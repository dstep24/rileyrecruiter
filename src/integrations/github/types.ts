/**
 * GitHub Integration Types
 *
 * TypeScript interfaces for GitHub API integration used in candidate sourcing.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface GitHubConfig {
  /** Personal access token (PAT) for authenticated API access */
  token: string;
  /** Optional: Custom base URL for GitHub Enterprise */
  baseUrl?: string;
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface GitHubSearchQuery {
  /** Programming language filter (e.g., "typescript", "python", "go") */
  language?: string;
  /** Location filter (e.g., "San Francisco", "New York", "Remote") */
  location?: string;
  /** Followers count filter (e.g., ">100", "50..500", ">=1000") */
  followers?: string;
  /** Repository count filter (e.g., ">10", "5..50") */
  repos?: string;
  /** Keywords to search in bio/profile */
  keywords?: string[];
  /** Full name search */
  fullname?: string;
  /** Type of account (default: "user") */
  type?: 'user' | 'org';
}

export interface GitHubSearchResult {
  totalCount: number;
  incompleteResults: boolean;
  items: GitHubUser[];
}

// =============================================================================
// USER/PROFILE TYPES
// =============================================================================

export interface GitHubUser {
  id: number;
  login: string;
  nodeId: string;
  avatarUrl: string;
  gravatarId: string;
  url: string;
  htmlUrl: string;
  type: 'User' | 'Organization';
  siteAdmin: boolean;
  score?: number;
}

export interface GitHubProfile extends GitHubUser {
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitterUsername: string | null;
  publicRepos: number;
  publicGists: number;
  followers: number;
  following: number;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// REPOSITORY TYPES
// =============================================================================

export interface GitHubRepo {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  private: boolean;
  owner: GitHubUser;
  htmlUrl: string;
  description: string | null;
  fork: boolean;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  homepage: string | null;
  size: number;
  stargazersCount: number;
  watchersCount: number;
  language: string | null;
  forksCount: number;
  openIssuesCount: number;
  defaultBranch: string;
  topics: string[];
}

// =============================================================================
// COMMIT TYPES
// =============================================================================

export interface GitHubCommit {
  sha: string;
  nodeId: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  htmlUrl: string;
  author: GitHubUser | null;
  committer: GitHubUser | null;
}

// =============================================================================
// CONTRIBUTION/STATS TYPES
// =============================================================================

export interface ContributionStats {
  username: string;
  totalRepos: number;
  totalStars: number;
  totalForks: number;
  topLanguages: LanguageStat[];
  recentActivity: {
    commitsLast30Days: number;
    lastCommitDate: string | null;
  };
}

export interface LanguageStat {
  language: string;
  repoCount: number;
  percentage: number;
}

// =============================================================================
// EMAIL EXTRACTION TYPES
// =============================================================================

export interface EmailExtractionResult {
  email: string | null;
  source: 'profile' | 'commits' | null;
  confidence: 'high' | 'medium' | 'low';
  allEmails: ExtractedEmail[];
}

export interface ExtractedEmail {
  email: string;
  source: 'profile' | 'commits';
  commitCount?: number;
  isNoreply: boolean;
}

// =============================================================================
// ENRICHED CANDIDATE TYPES
// =============================================================================

export interface GitHubCandidate {
  // Core GitHub data
  username: string;
  githubUrl: string;
  avatarUrl: string;

  // Profile info
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  blog: string | null;
  twitterUsername: string | null;
  linkedinUrl: string | null; // Extracted from bio or blog field
  hireable: boolean | null;

  // Stats
  followers: number;
  following: number;
  publicRepos: number;

  // Technical profile
  topLanguages: string[];
  totalStars: number;

  // Contact
  email: string | null;
  emailSource: 'profile' | 'commits' | null;
  emailConfidence: 'high' | 'medium' | 'low';

  // Metadata
  githubCreatedAt: string;
  enrichedAt: Date;
}

// =============================================================================
// API RESPONSE TYPES (raw GitHub API responses)
// =============================================================================

export interface GitHubApiSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubApiUser[];
}

export interface GitHubApiUser {
  id: number;
  login: string;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  type: 'User' | 'Organization';
  site_admin: boolean;
  score?: number;
  // Extended fields for full profile
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  email?: string | null;
  hireable?: boolean | null;
  bio?: string | null;
  twitter_username?: string | null;
  public_repos?: number;
  public_gists?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GitHubApiRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubApiUser;
  html_url: string;
  description: string | null;
  fork: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  topics?: string[];
}

export interface GitHubApiCommit {
  sha: string;
  node_id: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
  author: GitHubApiUser | null;
  committer: GitHubApiUser | null;
}
