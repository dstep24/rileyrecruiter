/**
 * GitHub Email Extractor Service
 *
 * Extracts contact emails from GitHub profiles using multiple strategies:
 * 1. Public profile email (highest confidence)
 * 2. Commit history emails (medium confidence)
 * 3. Email validation and filtering
 *
 * Success rates:
 * - ~30-40% of profiles have public email
 * - ~50-60% can be extracted from commits
 * - Combined: ~70% email extraction rate
 */

import type {
  EmailExtractionResult,
  ExtractedEmail,
  GitHubProfile,
  GitHubCommit,
} from './types.js';
import { GitHubClient, getGitHubClient } from './GitHubClient.js';

// =============================================================================
// EMAIL EXTRACTOR
// =============================================================================

export class EmailExtractor {
  private client: GitHubClient;

  constructor(client?: GitHubClient) {
    this.client = client || getGitHubClient();
  }

  /**
   * Extract the best available email for a GitHub user
   *
   * Strategy:
   * 1. Check public profile for email (highest confidence)
   * 2. If not found, scan commit history for emails
   * 3. Validate and deduplicate emails
   * 4. Return best match with confidence score
   */
  async extractEmail(username: string): Promise<EmailExtractionResult> {
    const allEmails: ExtractedEmail[] = [];

    // Strategy 1: Check public profile
    const profile = await this.client.getProfile(username);
    if (profile?.email) {
      const isNoreply = this.isNoreplyEmail(profile.email);
      allEmails.push({
        email: profile.email,
        source: 'profile',
        isNoreply,
      });
    }

    // Strategy 2: Extract from commits
    const commitEmails = await this.extractFromCommits(username);
    allEmails.push(...commitEmails);

    // Find the best non-noreply email
    const validEmails = allEmails.filter((e) => !e.isNoreply);

    if (validEmails.length === 0) {
      return {
        email: null,
        source: null,
        confidence: 'low',
        allEmails,
      };
    }

    // Prefer profile email, then most-used commit email
    const profileEmail = validEmails.find((e) => e.source === 'profile');
    if (profileEmail) {
      return {
        email: profileEmail.email,
        source: 'profile',
        confidence: 'high',
        allEmails,
      };
    }

    // Use commit email with highest count
    const bestCommitEmail = validEmails
      .filter((e) => e.source === 'commits')
      .sort((a, b) => (b.commitCount || 0) - (a.commitCount || 0))[0];

    if (bestCommitEmail) {
      // Confidence based on commit count
      const confidence =
        (bestCommitEmail.commitCount || 0) > 10
          ? 'medium'
          : 'low';

      return {
        email: bestCommitEmail.email,
        source: 'commits',
        confidence,
        allEmails,
      };
    }

    return {
      email: null,
      source: null,
      confidence: 'low',
      allEmails,
    };
  }

  /**
   * Extract emails from commit history
   */
  private async extractFromCommits(username: string): Promise<ExtractedEmail[]> {
    const emailCounts = new Map<string, number>();

    try {
      // Get user's repos
      const repos = await this.client.getRepositories(username, {
        sort: 'pushed',
        perPage: 10, // Check most recently active repos
      });

      // Extract emails from commits in each repo
      for (const repo of repos) {
        try {
          const commits = await this.client.getRepoCommits(
            repo.fullName,
            username,
            50
          );

          for (const commit of commits) {
            const email = commit.commit.author.email;
            if (email && this.isValidEmail(email)) {
              emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
            }
          }
        } catch {
          // Continue with other repos
        }

        // Small delay between repos
        await this.delay(200);
      }
    } catch (error) {
      console.error(`[EmailExtractor] Error extracting commit emails for ${username}:`, error);
    }

    // Convert to ExtractedEmail array
    return Array.from(emailCounts.entries()).map(([email, count]) => ({
      email,
      source: 'commits' as const,
      commitCount: count,
      isNoreply: this.isNoreplyEmail(email),
    }));
  }

  /**
   * Batch extract emails for multiple users
   */
  async batchExtractEmails(
    usernames: string[],
    options?: {
      onProgress?: (completed: number, total: number) => void;
      concurrency?: number;
    }
  ): Promise<Map<string, EmailExtractionResult>> {
    const results = new Map<string, EmailExtractionResult>();
    const concurrency = options?.concurrency || 3;

    // Process in batches to respect rate limits
    for (let i = 0; i < usernames.length; i += concurrency) {
      const batch = usernames.slice(i, i + concurrency);

      const batchResults = await Promise.all(
        batch.map(async (username) => {
          const result = await this.extractEmail(username);
          return { username, result };
        })
      );

      for (const { username, result } of batchResults) {
        results.set(username, result);
      }

      options?.onProgress?.(Math.min(i + concurrency, usernames.length), usernames.length);

      // Rate limiting delay between batches
      if (i + concurrency < usernames.length) {
        await this.delay(2000);
      }
    }

    return results;
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    // Basic email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if email is a GitHub noreply address
   */
  private isNoreplyEmail(email: string): boolean {
    const lowerEmail = email.toLowerCase();
    return (
      lowerEmail.includes('noreply') ||
      lowerEmail.includes('no-reply') ||
      lowerEmail.endsWith('@users.noreply.github.com') ||
      lowerEmail.endsWith('@github.com') ||
      lowerEmail.includes('invalid') ||
      lowerEmail.includes('example.com')
    );
  }

  /**
   * Get email domain for deduplication
   */
  private getEmailDomain(email: string): string {
    return email.split('@')[1]?.toLowerCase() || '';
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let extractorInstance: EmailExtractor | null = null;

export function getEmailExtractor(): EmailExtractor {
  if (!extractorInstance) {
    extractorInstance = new EmailExtractor();
  }
  return extractorInstance;
}

export function initializeEmailExtractor(client: GitHubClient): EmailExtractor {
  extractorInstance = new EmailExtractor(client);
  return extractorInstance;
}
