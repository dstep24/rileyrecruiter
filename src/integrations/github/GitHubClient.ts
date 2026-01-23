/**
 * GitHub API Client
 *
 * Provides integration with GitHub's API for candidate sourcing:
 * - Search users by language, location, followers
 * - Get detailed profiles
 * - Get repository and contribution stats
 * - Extract emails from profiles and commits
 *
 * Rate Limits:
 * - Authenticated: 5,000 requests/hour
 * - Search: 30 requests/minute
 *
 * API Docs: https://docs.github.com/en/rest
 */

import { Octokit } from '@octokit/rest';
import type {
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
  GitHubApiSearchResponse,
  GitHubApiUser,
  GitHubApiRepo,
  GitHubApiCommit,
} from './types.js';

// =============================================================================
// GITHUB CLIENT
// =============================================================================

export class GitHubClient {
  private octokit: Octokit;
  private config: GitHubConfig;

  // Rate limit tracking
  private searchRequestCount = 0;
  private searchResetTime: Date = new Date();
  private lastRequestTime: Date = new Date(0);

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl,
    });
  }

  // ===========================================================================
  // SEARCH
  // ===========================================================================

  /**
   * Search GitHub users by criteria
   *
   * @example
   * // Find TypeScript developers in San Francisco with 100+ followers
   * const results = await client.searchUsers({
   *   language: 'typescript',
   *   location: 'San Francisco',
   *   followers: '>100'
   * });
   */
  async searchUsers(query: GitHubSearchQuery): Promise<GitHubSearchResult> {
    await this.enforceSearchRateLimit();

    const q = this.buildSearchQuery(query);
    console.log(`[GitHubClient] Searching users with query: "${q}"`);

    const response = await this.octokit.search.users({
      q,
      per_page: 100,
      sort: 'followers',
      order: 'desc',
    });

    const data = response.data as GitHubApiSearchResponse;

    return {
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      items: data.items.map(this.normalizeUser),
    };
  }

  /**
   * Search users with pagination via async generator
   */
  async *searchUsersIterator(
    query: GitHubSearchQuery,
    maxResults: number = 100
  ): AsyncGenerator<GitHubUser[], void, unknown> {
    let page = 1;
    let totalFetched = 0;
    const perPage = Math.min(100, maxResults);

    while (totalFetched < maxResults) {
      await this.enforceSearchRateLimit();

      const q = this.buildSearchQuery(query);

      const response = await this.octokit.search.users({
        q,
        per_page: perPage,
        page,
        sort: 'followers',
        order: 'desc',
      });

      const data = response.data as GitHubApiSearchResponse;
      const users = data.items.map(this.normalizeUser);

      if (users.length === 0) break;

      yield users;
      totalFetched += users.length;

      // GitHub search API limits to 1000 results
      if (totalFetched >= 1000 || totalFetched >= data.total_count) break;

      page++;

      // Rate limiting delay between pages
      await this.delay(2000);
    }
  }

  /**
   * Build GitHub search query string from structured query
   */
  private buildSearchQuery(query: GitHubSearchQuery): string {
    const parts: string[] = [];

    // Type filter (default to users)
    parts.push(`type:${query.type || 'user'}`);

    // Language - search in repos, then filter users
    if (query.language) {
      parts.push(`language:${query.language}`);
    }

    // Location
    if (query.location) {
      parts.push(`location:"${query.location}"`);
    }

    // Followers count
    if (query.followers) {
      parts.push(`followers:${query.followers}`);
    }

    // Repository count
    if (query.repos) {
      parts.push(`repos:${query.repos}`);
    }

    // Keywords (bio search)
    if (query.keywords?.length) {
      // GitHub user search searches in username, email, and full name
      // For bio/readme, we'd need to search repos or use a different approach
      parts.push(query.keywords.join(' '));
    }

    // Full name
    if (query.fullname) {
      parts.push(`fullname:"${query.fullname}"`);
    }

    return parts.join(' ');
  }

  // ===========================================================================
  // PROFILE
  // ===========================================================================

  /**
   * Get detailed user profile
   */
  async getProfile(username: string): Promise<GitHubProfile | null> {
    try {
      const response = await this.octokit.users.getByUsername({ username });
      return this.normalizeProfile(response.data as GitHubApiUser);
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get user's social accounts (LinkedIn, Twitter, etc.)
   * This fetches from GitHub's dedicated social accounts API
   */
  async getSocialAccounts(username: string): Promise<{ provider: string; url: string }[]> {
    try {
      const response = await this.octokit.request('GET /users/{username}/social_accounts', {
        username,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      return (response.data as Array<{ provider: string; url: string }>).map((account) => ({
        provider: account.provider,
        url: account.url,
      }));
    } catch (error) {
      console.warn(`[GitHubClient] Failed to fetch social accounts for ${username}:`, error);
      return [];
    }
  }

  /**
   * Get user's public repositories
   */
  async getRepositories(
    username: string,
    options?: { sort?: 'created' | 'updated' | 'pushed' | 'full_name'; perPage?: number }
  ): Promise<GitHubRepo[]> {
    const response = await this.octokit.repos.listForUser({
      username,
      sort: options?.sort || 'pushed',
      per_page: options?.perPage || 100,
      type: 'owner', // Only repos they own, not forks
    });

    return (response.data as GitHubApiRepo[]).map(this.normalizeRepo);
  }

  /**
   * Get contribution statistics for a user
   */
  async getContributionStats(username: string): Promise<ContributionStats> {
    const repos = await this.getRepositories(username, { perPage: 100 });

    // Calculate language stats
    const languageCounts = new Map<string, number>();
    let totalStars = 0;
    let totalForks = 0;

    for (const repo of repos) {
      if (repo.language) {
        languageCounts.set(repo.language, (languageCounts.get(repo.language) || 0) + 1);
      }
      totalStars += repo.stargazersCount;
      totalForks += repo.forksCount;
    }

    // Convert to sorted array
    const topLanguages: LanguageStat[] = Array.from(languageCounts.entries())
      .map(([language, repoCount]) => ({
        language,
        repoCount,
        percentage: Math.round((repoCount / repos.length) * 100),
      }))
      .sort((a, b) => b.repoCount - a.repoCount)
      .slice(0, 10);

    // Get recent commit activity
    let commitsLast30Days = 0;
    let lastCommitDate: string | null = null;

    // Check top 5 most recently pushed repos for commit activity
    const recentRepos = repos.slice(0, 5);
    for (const repo of recentRepos) {
      try {
        const commits = await this.getRepoCommits(repo.fullName, username, 10);
        if (commits.length > 0 && !lastCommitDate) {
          lastCommitDate = commits[0].commit.author.date;
        }
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        commitsLast30Days += commits.filter(
          (c) => new Date(c.commit.author.date) > thirtyDaysAgo
        ).length;
      } catch {
        // Ignore errors for individual repos
      }
    }

    return {
      username,
      totalRepos: repos.length,
      totalStars,
      totalForks,
      topLanguages,
      recentActivity: {
        commitsLast30Days,
        lastCommitDate,
      },
    };
  }

  // ===========================================================================
  // COMMITS (for email extraction)
  // ===========================================================================

  /**
   * Get commits for a repository by a specific author
   */
  async getRepoCommits(
    repoFullName: string,
    author?: string,
    perPage: number = 100
  ): Promise<GitHubCommit[]> {
    const [owner, repo] = repoFullName.split('/');

    try {
      const response = await this.octokit.repos.listCommits({
        owner,
        repo,
        author,
        per_page: perPage,
      });

      return (response.data as GitHubApiCommit[]).map(this.normalizeCommit);
    } catch {
      return [];
    }
  }

  /**
   * Extract emails from a user's commit history
   *
   * Strategy:
   * 1. Get user's most active repos (by push date)
   * 2. Fetch commits authored by the user
   * 3. Extract unique emails from commit metadata
   * 4. Filter out noreply addresses
   */
  async getCommitEmails(username: string): Promise<string[]> {
    const emailCounts = new Map<string, number>();
    const repos = await this.getRepositories(username, { sort: 'pushed', perPage: 10 });

    for (const repo of repos) {
      try {
        const commits = await this.getRepoCommits(repo.fullName, username, 50);

        for (const commit of commits) {
          const email = commit.commit.author.email;
          if (email && !this.isNoreplyEmail(email)) {
            emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
          }
        }
      } catch {
        // Continue with other repos
      }

      // Rate limiting
      await this.delay(500);
    }

    // Sort by frequency (most used email first)
    return Array.from(emailCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([email]) => email);
  }

  /**
   * Check if email is a GitHub noreply address
   */
  private isNoreplyEmail(email: string): boolean {
    return (
      email.includes('noreply') ||
      email.endsWith('@users.noreply.github.com') ||
      email.endsWith('@github.com')
    );
  }

  /**
   * Extract LinkedIn URL from bio or blog fields
   * Checks common LinkedIn URL patterns
   */
  private extractLinkedInUrl(bio: string | null, blog: string | null): string | null {
    const textToSearch = `${bio || ''} ${blog || ''}`;

    // Match various LinkedIn URL patterns
    const linkedinPatterns = [
      // Full URLs with various formats
      /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?/i,
      /https?:\/\/(?:www\.)?linkedin\.com\/pub\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)\/?/i,
      /https?:\/\/(?:www\.)?linkedin\.com\/profile\/view\?id=([a-zA-Z0-9_-]+)/i,
      // URLs without protocol
      /(?:^|\s)(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?/i,
    ];

    for (const pattern of linkedinPatterns) {
      const match = textToSearch.match(pattern);
      if (match) {
        // Normalize to standard format
        const username = match[1];
        if (username && !username.includes('/')) {
          return `https://www.linkedin.com/in/${username}`;
        }
        // Return the full matched URL for complex patterns
        return match[0].trim().startsWith('http')
          ? match[0].trim()
          : `https://${match[0].trim()}`;
      }
    }

    return null;
  }

  // ===========================================================================
  // ENRICHED CANDIDATE
  // ===========================================================================

  /**
   * Get fully enriched candidate profile with email extraction
   */
  async enrichCandidate(username: string): Promise<GitHubCandidate | null> {
    const profile = await this.getProfile(username);
    if (!profile) return null;

    const stats = await this.getContributionStats(username);

    // Try to get email from profile first
    let email = profile.email;
    let emailSource: 'profile' | 'commits' | null = email ? 'profile' : null;
    let emailConfidence: 'high' | 'medium' | 'low' = email ? 'high' : 'low';

    // If no profile email, try commits
    if (!email) {
      const commitEmails = await this.getCommitEmails(username);
      if (commitEmails.length > 0) {
        email = commitEmails[0];
        emailSource = 'commits';
        // Higher confidence if email appears in multiple commits
        emailConfidence = commitEmails.length > 5 ? 'medium' : 'low';
      }
    }

    // Extract LinkedIn URL - first try GitHub's social accounts API, then fall back to bio/blog parsing
    let linkedinUrl = null;

    // Try fetching from GitHub's social accounts API (most reliable source)
    const socialAccounts = await this.getSocialAccounts(username);
    const linkedinAccount = socialAccounts.find(
      (account) => account.provider === 'linkedin' || account.url.includes('linkedin.com')
    );
    if (linkedinAccount) {
      linkedinUrl = linkedinAccount.url;
    }

    // Fall back to parsing bio/blog if not found in social accounts
    if (!linkedinUrl) {
      linkedinUrl = this.extractLinkedInUrl(profile.bio, profile.blog);
    }

    return {
      username: profile.login,
      githubUrl: profile.htmlUrl,
      avatarUrl: profile.avatarUrl,
      name: profile.name,
      bio: profile.bio,
      location: profile.location,
      company: profile.company,
      blog: profile.blog,
      twitterUsername: profile.twitterUsername,
      linkedinUrl,
      hireable: profile.hireable,
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.publicRepos,
      topLanguages: stats.topLanguages.slice(0, 5).map((l) => l.language),
      totalStars: stats.totalStars,
      email,
      emailSource,
      emailConfidence,
      githubCreatedAt: profile.createdAt,
      enrichedAt: new Date(),
    };
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  /**
   * Enforce search rate limit (30 requests/minute)
   */
  private async enforceSearchRateLimit(): Promise<void> {
    const now = new Date();

    // Reset counter if we're past the reset time
    if (now > this.searchResetTime) {
      this.searchRequestCount = 0;
      this.searchResetTime = new Date(now.getTime() + 60000); // 1 minute
    }

    // If we've hit the limit, wait until reset
    if (this.searchRequestCount >= 29) {
      const waitTime = this.searchResetTime.getTime() - now.getTime();
      if (waitTime > 0) {
        console.log(`[GitHubClient] Search rate limit reached, waiting ${waitTime}ms`);
        await this.delay(waitTime);
        this.searchRequestCount = 0;
        this.searchResetTime = new Date(Date.now() + 60000);
      }
    }

    // Minimum delay between requests
    const timeSinceLastRequest = now.getTime() - this.lastRequestTime.getTime();
    if (timeSinceLastRequest < 500) {
      await this.delay(500 - timeSinceLastRequest);
    }

    this.searchRequestCount++;
    this.lastRequestTime = new Date();
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(): Promise<{
    remaining: number;
    limit: number;
    resetAt: Date;
    searchRemaining: number;
    searchLimit: number;
    searchResetAt: Date;
  }> {
    const response = await this.octokit.rateLimit.get();
    const { core, search } = response.data.resources;

    return {
      remaining: core.remaining,
      limit: core.limit,
      resetAt: new Date(core.reset * 1000),
      searchRemaining: search.remaining,
      searchLimit: search.limit,
      searchResetAt: new Date(search.reset * 1000),
    };
  }

  // ===========================================================================
  // NORMALIZATION HELPERS
  // ===========================================================================

  private normalizeUser = (data: GitHubApiUser): GitHubUser => ({
    id: data.id,
    login: data.login,
    nodeId: data.node_id,
    avatarUrl: data.avatar_url,
    gravatarId: data.gravatar_id,
    url: data.url,
    htmlUrl: data.html_url,
    type: data.type,
    siteAdmin: data.site_admin,
    score: data.score,
  });

  private normalizeProfile = (data: GitHubApiUser): GitHubProfile => ({
    ...this.normalizeUser(data),
    name: data.name ?? null,
    company: data.company ?? null,
    blog: data.blog ?? null,
    location: data.location ?? null,
    email: data.email ?? null,
    hireable: data.hireable ?? null,
    bio: data.bio ?? null,
    twitterUsername: data.twitter_username ?? null,
    publicRepos: data.public_repos ?? 0,
    publicGists: data.public_gists ?? 0,
    followers: data.followers ?? 0,
    following: data.following ?? 0,
    createdAt: data.created_at ?? '',
    updatedAt: data.updated_at ?? '',
  });

  private normalizeRepo = (data: GitHubApiRepo): GitHubRepo => ({
    id: data.id,
    nodeId: data.node_id,
    name: data.name,
    fullName: data.full_name,
    private: data.private,
    owner: this.normalizeUser(data.owner),
    htmlUrl: data.html_url,
    description: data.description,
    fork: data.fork,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    pushedAt: data.pushed_at,
    homepage: data.homepage,
    size: data.size,
    stargazersCount: data.stargazers_count,
    watchersCount: data.watchers_count,
    language: data.language,
    forksCount: data.forks_count,
    openIssuesCount: data.open_issues_count,
    defaultBranch: data.default_branch,
    topics: data.topics || [],
  });

  private normalizeCommit = (data: GitHubApiCommit): GitHubCommit => ({
    sha: data.sha,
    nodeId: data.node_id,
    commit: data.commit,
    htmlUrl: data.html_url,
    author: data.author ? this.normalizeUser(data.author) : null,
    committer: data.committer ? this.normalizeUser(data.committer) : null,
  });

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let githubInstance: GitHubClient | null = null;

export function initializeGitHubClient(config: GitHubConfig): GitHubClient {
  githubInstance = new GitHubClient(config);
  return githubInstance;
}

export function getGitHubClient(): GitHubClient {
  if (!githubInstance) {
    throw new Error('GitHubClient not initialized. Call initializeGitHubClient first.');
  }
  return githubInstance;
}

/**
 * Check if GitHub client is configured
 */
export function isGitHubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

/**
 * Initialize GitHub client from environment variables
 */
export function initializeGitHubClientFromEnv(): GitHubClient | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('[GitHubClient] GITHUB_TOKEN not configured, GitHub sourcing disabled');
    return null;
  }

  return initializeGitHubClient({
    token,
    baseUrl: process.env.GITHUB_API_URL, // Optional for GitHub Enterprise
  });
}
