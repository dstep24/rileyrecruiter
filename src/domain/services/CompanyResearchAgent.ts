/**
 * Company Research Agent
 *
 * Enriches company data for candidates using Unipile's LinkedIn company search.
 * Provides actual company size/headcount data to improve AI scoring accuracy.
 *
 * Features:
 * - Per-candidate research (manual trigger)
 * - Batch research (automatic mode)
 * - In-memory caching (24-hour TTL)
 * - Graceful fallback when lookup fails
 */

import {
  UnipileClient,
  CompanyInfo,
  initializeUnipileClient,
  type UnipileConfig,
} from '../../integrations/linkedin/UnipileClient.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CompanyResearchResult {
  companyName: string;
  info: CompanyInfo | null;
  source: 'cache' | 'api' | 'not_found';
  durationMs: number;
}

export interface BatchResearchResult {
  companies: Map<string, CompanyInfo>;
  stats: {
    total: number;
    found: number;
    cached: number;
    notFound: number;
    durationMs: number;
  };
}

export interface CandidateWithCompany {
  id: string;
  name: string;
  currentTitle: string;
  currentCompany: string;
  headline?: string;
  location?: string;
  companyInfo?: CompanyInfo;
}

// =============================================================================
// COMPANY RESEARCH AGENT
// =============================================================================

export class CompanyResearchAgent {
  private cache: Map<string, CompanyInfo> = new Map();
  private pendingLookups: Map<string, Promise<CompanyInfo | null>> = new Map();
  private unipileClient: UnipileClient | null = null;

  constructor(unipileConfig?: UnipileConfig) {
    if (unipileConfig) {
      this.unipileClient = initializeUnipileClient(unipileConfig);
    }
  }

  /**
   * Set the Unipile client (for dependency injection)
   */
  setUnipileClient(client: UnipileClient): void {
    this.unipileClient = client;
  }

  /**
   * Check if Unipile is configured
   */
  isAvailable(): boolean {
    return this.unipileClient !== null;
  }

  /**
   * Research a single company by name
   */
  async researchCompany(companyName: string): Promise<CompanyResearchResult> {
    const startTime = Date.now();
    const normalizedName = this.normalizeCompanyName(companyName);

    // Check cache first
    const cached = this.cache.get(normalizedName);
    if (cached && !this.isStale(cached)) {
      return {
        companyName,
        info: cached,
        source: 'cache',
        durationMs: Date.now() - startTime,
      };
    }

    // Check if there's already a pending lookup for this company
    const pending = this.pendingLookups.get(normalizedName);
    if (pending) {
      const info = await pending;
      return {
        companyName,
        info,
        source: 'api',
        durationMs: Date.now() - startTime,
      };
    }

    // No Unipile client available
    if (!this.unipileClient) {
      return {
        companyName,
        info: null,
        source: 'not_found',
        durationMs: Date.now() - startTime,
      };
    }

    // Start a new lookup
    const lookupPromise = this.lookupCompany(companyName);
    this.pendingLookups.set(normalizedName, lookupPromise);

    try {
      const info = await lookupPromise;

      if (info) {
        this.cache.set(normalizedName, info);
        return {
          companyName,
          info,
          source: 'api',
          durationMs: Date.now() - startTime,
        };
      }

      return {
        companyName,
        info: null,
        source: 'not_found',
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.pendingLookups.delete(normalizedName);
    }
  }

  /**
   * Research multiple companies (deduplicates, batches, caches)
   */
  async researchBatch(companyNames: string[]): Promise<BatchResearchResult> {
    const startTime = Date.now();
    const companies = new Map<string, CompanyInfo>();
    let found = 0;
    let cached = 0;
    let notFound = 0;

    // Deduplicate company names
    const uniqueNames = [...new Set(companyNames.filter(Boolean))];

    // Check cache and identify which ones need lookup
    const toResearch: string[] = [];

    for (const name of uniqueNames) {
      const normalizedName = this.normalizeCompanyName(name);
      const cachedInfo = this.cache.get(normalizedName);

      if (cachedInfo && !this.isStale(cachedInfo)) {
        companies.set(normalizedName, cachedInfo);
        cached++;
      } else {
        toResearch.push(name);
      }
    }

    // Batch lookup via Unipile (if available)
    if (this.unipileClient && toResearch.length > 0) {
      // Process in batches of 5 to avoid rate limits
      const batchSize = 5;

      for (let i = 0; i < toResearch.length; i += batchSize) {
        const batch = toResearch.slice(i, i + batchSize);

        const results = await Promise.all(
          batch.map((name) => this.researchCompany(name))
        );

        for (const result of results) {
          if (result.info) {
            companies.set(this.normalizeCompanyName(result.companyName), result.info);
            if (result.source === 'api') {
              found++;
            }
          } else {
            notFound++;
          }
        }

        // Rate limiting delay between batches
        if (i + batchSize < toResearch.length) {
          await this.delay(500);
        }
      }
    } else {
      notFound = toResearch.length;
    }

    return {
      companies,
      stats: {
        total: uniqueNames.length,
        found,
        cached,
        notFound,
        durationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Enrich candidates with company info
   */
  async enrichCandidates(
    candidates: CandidateWithCompany[]
  ): Promise<{
    candidates: CandidateWithCompany[];
    stats: BatchResearchResult['stats'];
  }> {
    // Extract unique company names
    const companyNames = candidates
      .map((c) => c.currentCompany)
      .filter(Boolean);

    // Research companies
    const research = await this.researchBatch(companyNames);

    // Enrich candidates with company info
    const enrichedCandidates = candidates.map((candidate) => {
      const normalizedCompany = this.normalizeCompanyName(candidate.currentCompany);
      const companyInfo = research.companies.get(normalizedCompany);

      return {
        ...candidate,
        companyInfo: companyInfo || undefined,
      };
    });

    return {
      candidates: enrichedCandidates,
      stats: research.stats,
    };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async lookupCompany(companyName: string): Promise<CompanyInfo | null> {
    if (!this.unipileClient) {
      return null;
    }

    try {
      const info = await this.unipileClient.researchCompany(companyName);
      return info;
    } catch (error) {
      console.error(`[CompanyResearchAgent] Lookup failed for ${companyName}:`, error);
      return null;
    }
  }

  private normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  private isStale(info: CompanyInfo): boolean {
    // Cache for 24 hours
    const staleThreshold = 24 * 60 * 60 * 1000;
    return Date.now() - info.enrichedAt.getTime() > staleThreshold;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let agentInstance: CompanyResearchAgent | null = null;

export function getCompanyResearchAgent(): CompanyResearchAgent {
  if (!agentInstance) {
    agentInstance = new CompanyResearchAgent();
  }
  return agentInstance;
}

export function initializeCompanyResearchAgent(
  unipileConfig: UnipileConfig
): CompanyResearchAgent {
  agentInstance = new CompanyResearchAgent(unipileConfig);
  return agentInstance;
}

export function resetCompanyResearchAgent(): void {
  agentInstance = null;
}
