/**
 * Sourcing Service - Candidate Discovery & Search
 *
 * Handles candidate search query generation, ranking, and pipeline building
 * from various sources (LinkedIn, job boards, ATS databases).
 *
 * Key Responsibilities:
 * - Generate boolean search queries
 * - Rank and score candidates
 * - Build candidate pipelines
 * - Deduplicate across sources
 * - Track source effectiveness
 */

import { v4 as uuid } from 'uuid';
import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { JobRequisition, Candidate, Criteria } from '../../generated/prisma/index.js';
import {
  getUnipileClient,
  UnipileClient,
  unipileToLinkedInProfile,
  type UnipileSearchParams,
  type UnipileProfile,
} from '../../integrations/linkedin/UnipileClient.js';
import {
  getJobDescriptionParser,
  JobDescriptionParser,
  type ParsedJobCriteria,
  type JobDescriptionInput,
} from './JobDescriptionParser.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchQuery {
  id: string;
  requisitionId: string;

  // Query details
  source: SourceType;
  queryType: 'boolean' | 'keyword' | 'semantic';
  query: string;

  // Filters
  filters: SearchFilters;

  // Metadata
  generatedAt: Date;
  estimatedResults?: number;
  lastUsed?: Date;
  resultsCount?: number;
  conversionRate?: number; // % that became candidates
}

export type SourceType =
  | 'linkedin'
  | 'indeed'
  | 'glassdoor'
  | 'github'
  | 'stackoverflow'
  | 'angellist'
  | 'internal_ats'
  | 'referral_network';

export interface SearchFilters {
  locations?: string[];
  experienceYears?: { min?: number; max?: number };
  currentCompanies?: string[];
  excludeCompanies?: string[];
  skills?: string[];
  titles?: string[];
  educationLevel?: string[];
  industries?: string[];
  openToWork?: boolean;
  activelyLooking?: boolean;
}

export interface SourcedCandidate {
  id: string;
  sourceId: string; // ID from the source platform
  source: SourceType;
  requisitionId: string;

  // Profile
  name: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  profileUrl: string;

  // Scoring
  relevanceScore: number; // 0-100
  fitScore?: number;
  sourcingNotes: string[];

  // Status
  status: 'new' | 'reviewed' | 'qualified' | 'contacted' | 'disqualified' | 'duplicate';

  // Metadata
  sourcedAt: Date;
  searchQueryId: string;
}

export interface CandidatePipeline {
  id: string;
  tenantId: string;
  requisitionId: string;
  name: string;

  // Candidates by stage
  stages: PipelineStage[];

  // Stats
  totalCandidates: number;
  activeSearches: number;
  sourcesUsed: SourceType[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStage {
  name: string;
  order: number;
  candidates: SourcedCandidate[];
  count: number;
}

export interface SourcingConfig {
  tenantId: string;
  criteria: Criteria;
  sources: SourceType[];
  dailyLimit: number; // Max candidates to source per day
  deduplicationEnabled: boolean;
}

// =============================================================================
// SOURCING SERVICE
// =============================================================================

export class SourcingService {
  private claude: ClaudeClient;
  private unipile: UnipileClient | null = null;
  private jdParser: JobDescriptionParser;

  constructor(claude?: ClaudeClient) {
    this.claude = claude || getClaudeClient();
    this.jdParser = getJobDescriptionParser();

    // Try to initialize Unipile client if configured
    try {
      this.unipile = getUnipileClient();
    } catch {
      // Unipile not configured - will use fallback methods
      console.log('[SourcingService] Unipile not configured, using mock data');
    }
  }

  // ===========================================================================
  // SEARCH QUERY GENERATION
  // ===========================================================================

  /**
   * Generate optimized search queries for a requisition
   */
  async generateSearchQueries(
    requisition: JobRequisition,
    sources: SourceType[],
    config: SourcingConfig
  ): Promise<SearchQuery[]> {
    const queries: SearchQuery[] = [];

    for (const source of sources) {
      // Generate boolean query
      const booleanQuery = await this.generateBooleanQuery(requisition, source);
      queries.push(booleanQuery);

      // Generate keyword variants
      const keywordQueries = await this.generateKeywordQueries(requisition, source);
      queries.push(...keywordQueries);
    }

    return queries;
  }

  /**
   * Generate a boolean search query
   */
  async generateBooleanQuery(
    requisition: JobRequisition,
    source: SourceType
  ): Promise<SearchQuery> {
    const reqExtended = requisition as unknown as {
      title: string;
      description?: string;
      skills?: string[];
      yearsRequired?: number;
      location?: string;
    };

    const prompt = `Generate an optimized boolean search query for ${source}:

JOB DETAILS:
- Title: ${requisition.title}
- Description: ${reqExtended.description || 'Not provided'}
- Required Skills: ${reqExtended.skills?.join(', ') || 'Not specified'}
- Experience: ${reqExtended.yearsRequired || 'Not specified'} years
- Location: ${reqExtended.location || 'Remote'}

Create a boolean query using:
- AND, OR, NOT operators
- Quotation marks for exact phrases
- Parentheses for grouping
- Relevant synonyms and variations

Platform-specific considerations for ${source}:
${this.getSourceSpecificTips(source)}

Return JSON:
{
  "query": "The boolean search string",
  "filters": {
    "locations": ["suggested locations"],
    "experienceYears": { "min": X, "max": Y },
    "skills": ["key skills to filter"],
    "titles": ["title variations to include"]
  },
  "estimatedResults": "rough estimate",
  "rationale": "brief explanation of query strategy"
}`;

    const response = await this.claude.complete({
      prompt,
      system: 'You are an expert technical recruiter who specializes in sourcing. Generate highly effective search queries.',
      maxTokens: 800,
    });

    const result = JSON.parse(response.content);

    return {
      id: uuid(),
      requisitionId: requisition.id,
      source,
      queryType: 'boolean',
      query: result.query,
      filters: result.filters,
      generatedAt: new Date(),
      estimatedResults: parseInt(result.estimatedResults) || undefined,
    };
  }

  /**
   * Generate keyword search variations
   */
  async generateKeywordQueries(
    requisition: JobRequisition,
    source: SourceType
  ): Promise<SearchQuery[]> {
    const prompt = `Generate 3 different keyword search variations for ${source}:

Role: ${requisition.title}

Create variations targeting:
1. Direct title match
2. Senior/lead variations
3. Skill-focused search

Return JSON array:
[
  { "query": "keyword query 1", "focus": "what this targets" },
  { "query": "keyword query 2", "focus": "what this targets" },
  { "query": "keyword query 3", "focus": "what this targets" }
]`;

    const response = await this.claude.complete({
      prompt,
      maxTokens: 400,
    });

    const variations = JSON.parse(response.content);

    return variations.map((v: { query: string; focus: string }) => ({
      id: uuid(),
      requisitionId: requisition.id,
      source,
      queryType: 'keyword' as const,
      query: v.query,
      filters: {},
      generatedAt: new Date(),
    }));
  }

  private getSourceSpecificTips(source: SourceType): string {
    const tips: Record<SourceType, string> = {
      linkedin: `
- Use "current company" searches
- Leverage "Skills" section matching
- Consider "Open to Work" filter
- Use industry filters`,
      indeed: `
- Focus on resume keywords
- Use location radius
- Include salary expectations`,
      glassdoor: `
- Search by company reviews
- Filter by interview experience`,
      github: `
- Search by language expertise
- Look for contribution patterns
- Check repository stars`,
      stackoverflow: `
- Filter by reputation score
- Search by tag expertise
- Look for accepted answers`,
      angellist: `
- Filter by startup stage preference
- Include equity interest
- Search by role type`,
      internal_ats: `
- Search past applicants
- Include silver medalists
- Check warm leads`,
      referral_network: `
- Search employee connections
- Filter by mutual connections
- Include alumni networks`,
    };

    return tips[source] || 'Standard search optimization';
  }

  // ===========================================================================
  // CANDIDATE RANKING
  // ===========================================================================

  /**
   * Score and rank candidates from search results
   */
  async rankCandidates(
    candidates: Array<{
      name: string;
      headline?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      experience?: number;
      profileUrl: string;
      sourceId: string;
    }>,
    requisition: JobRequisition,
    config: SourcingConfig
  ): Promise<SourcedCandidate[]> {
    const rankedCandidates: SourcedCandidate[] = [];

    for (const candidate of candidates) {
      const score = await this.scoreCandidate(candidate, requisition, config.criteria);

      rankedCandidates.push({
        id: uuid(),
        sourceId: candidate.sourceId,
        source: 'linkedin', // Would come from actual source
        requisitionId: requisition.id,
        name: candidate.name,
        headline: candidate.headline,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        location: candidate.location,
        profileUrl: candidate.profileUrl,
        relevanceScore: score.relevanceScore,
        fitScore: score.fitScore,
        sourcingNotes: score.notes,
        status: 'new',
        sourcedAt: new Date(),
        searchQueryId: '', // Would be set from actual search
      });
    }

    // Sort by relevance
    return rankedCandidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private async scoreCandidate(
    candidate: {
      name: string;
      headline?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      skills?: string[];
      experience?: number;
    },
    requisition: JobRequisition,
    criteria: Criteria
  ): Promise<{
    relevanceScore: number;
    fitScore: number;
    notes: string[];
  }> {
    const reqExtended = requisition as unknown as {
      title: string;
      skills?: string[];
      yearsRequired?: number;
      targetCompanies?: string[];
    };

    const prompt = `Score this candidate for the role:

ROLE: ${requisition.title}
Required Skills: ${reqExtended.skills?.join(', ') || 'Not specified'}
Experience Needed: ${reqExtended.yearsRequired || 'Not specified'} years
Target Companies: ${reqExtended.targetCompanies?.join(', ') || 'None specified'}

CANDIDATE:
Name: ${candidate.name}
Title: ${candidate.currentTitle || 'Unknown'}
Company: ${candidate.currentCompany || 'Unknown'}
Location: ${candidate.location || 'Unknown'}
Skills: ${candidate.skills?.join(', ') || 'Unknown'}
Experience: ${candidate.experience || 'Unknown'} years
Headline: ${candidate.headline || 'None'}

Score 0-100 on:
1. Relevance: How well does their background match?
2. Fit: How likely are they to be a good hire?

Return JSON:
{
  "relevanceScore": 0-100,
  "fitScore": 0-100,
  "notes": ["note1", "note2"],
  "strengths": ["strength1"],
  "concerns": ["concern1"]
}`;

    const response = await this.claude.complete({
      prompt,
      maxTokens: 300,
    });

    const result = JSON.parse(response.content);

    return {
      relevanceScore: result.relevanceScore,
      fitScore: result.fitScore,
      notes: [...result.notes, ...result.strengths.map((s: string) => `+ ${s}`), ...result.concerns.map((c: string) => `! ${c}`)],
    };
  }

  // ===========================================================================
  // PIPELINE MANAGEMENT
  // ===========================================================================

  /**
   * Create a sourcing pipeline for a requisition
   */
  createPipeline(
    tenantId: string,
    requisition: JobRequisition,
    sources: SourceType[]
  ): CandidatePipeline {
    const defaultStages: PipelineStage[] = [
      { name: 'Sourced', order: 1, candidates: [], count: 0 },
      { name: 'Reviewed', order: 2, candidates: [], count: 0 },
      { name: 'Qualified', order: 3, candidates: [], count: 0 },
      { name: 'Contacted', order: 4, candidates: [], count: 0 },
      { name: 'Responded', order: 5, candidates: [], count: 0 },
    ];

    return {
      id: uuid(),
      tenantId,
      requisitionId: requisition.id,
      name: `${requisition.title} Pipeline`,
      stages: defaultStages,
      totalCandidates: 0,
      activeSearches: 0,
      sourcesUsed: sources,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Add candidates to pipeline
   */
  addToPipeline(
    pipeline: CandidatePipeline,
    candidates: SourcedCandidate[],
    stageName: string = 'Sourced'
  ): CandidatePipeline {
    const stage = pipeline.stages.find((s) => s.name === stageName);
    if (!stage) {
      throw new Error(`Stage ${stageName} not found`);
    }

    stage.candidates.push(...candidates);
    stage.count = stage.candidates.length;

    return {
      ...pipeline,
      totalCandidates: pipeline.stages.reduce((sum, s) => sum + s.count, 0),
      updatedAt: new Date(),
    };
  }

  /**
   * Move candidate to next stage
   */
  advanceCandidate(
    pipeline: CandidatePipeline,
    candidateId: string,
    toStage: string
  ): CandidatePipeline {
    // Find and remove from current stage
    let candidate: SourcedCandidate | undefined;
    for (const stage of pipeline.stages) {
      const idx = stage.candidates.findIndex((c) => c.id === candidateId);
      if (idx >= 0) {
        candidate = stage.candidates.splice(idx, 1)[0];
        stage.count = stage.candidates.length;
        break;
      }
    }

    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found in pipeline`);
    }

    // Add to new stage
    const targetStage = pipeline.stages.find((s) => s.name === toStage);
    if (!targetStage) {
      throw new Error(`Stage ${toStage} not found`);
    }

    targetStage.candidates.push(candidate);
    targetStage.count = targetStage.candidates.length;

    return {
      ...pipeline,
      updatedAt: new Date(),
    };
  }

  // ===========================================================================
  // DEDUPLICATION
  // ===========================================================================

  /**
   * Check for and handle duplicate candidates
   */
  async deduplicateCandidates(
    candidates: SourcedCandidate[],
    existingCandidates: Candidate[]
  ): Promise<{
    unique: SourcedCandidate[];
    duplicates: Array<{
      sourced: SourcedCandidate;
      existing: Candidate;
      confidence: number;
    }>;
  }> {
    const unique: SourcedCandidate[] = [];
    const duplicates: Array<{
      sourced: SourcedCandidate;
      existing: Candidate;
      confidence: number;
    }> = [];

    for (const candidate of candidates) {
      const match = await this.findDuplicate(candidate, existingCandidates);

      if (match) {
        duplicates.push({
          sourced: candidate,
          existing: match.candidate,
          confidence: match.confidence,
        });
      } else {
        unique.push(candidate);
      }
    }

    return { unique, duplicates };
  }

  private async findDuplicate(
    candidate: SourcedCandidate,
    existingCandidates: Candidate[]
  ): Promise<{ candidate: Candidate; confidence: number } | null> {
    for (const existing of existingCandidates) {
      const confidence = this.calculateMatchConfidence(candidate, existing);

      if (confidence >= 0.8) {
        return { candidate: existing, confidence };
      }
    }

    return null;
  }

  private calculateMatchConfidence(
    sourced: SourcedCandidate,
    existing: Candidate
  ): number {
    let score = 0;
    let factors = 0;

    // Name match
    const sourcedName = sourced.name.toLowerCase();
    const existingName = `${existing.firstName} ${existing.lastName}`.toLowerCase();
    if (sourcedName === existingName) {
      score += 0.4;
    } else if (sourcedName.includes(existing.firstName.toLowerCase())) {
      score += 0.2;
    }
    factors += 0.4;

    // Company match
    const existingCompany = (existing as unknown as { currentCompany?: string }).currentCompany;
    if (sourced.currentCompany && existingCompany) {
      if (sourced.currentCompany.toLowerCase() === existingCompany.toLowerCase()) {
        score += 0.3;
      }
    }
    factors += 0.3;

    // Title match
    const existingTitle = (existing as unknown as { currentTitle?: string }).currentTitle;
    if (sourced.currentTitle && existingTitle) {
      if (sourced.currentTitle.toLowerCase() === existingTitle.toLowerCase()) {
        score += 0.3;
      }
    }
    factors += 0.3;

    return factors > 0 ? score / factors : 0;
  }

  // ===========================================================================
  // SOURCE ANALYTICS
  // ===========================================================================

  /**
   * Analyze source effectiveness
   */
  async analyzeSourceEffectiveness(
    queries: SearchQuery[],
    sourcedCandidates: SourcedCandidate[]
  ): Promise<
    Array<{
      source: SourceType;
      queriesRun: number;
      candidatesSourced: number;
      avgRelevanceScore: number;
      conversionRate: number;
      costPerCandidate?: number;
    }>
  > {
    const sourceStats = new Map<
      SourceType,
      {
        queries: number;
        candidates: number;
        totalRelevance: number;
        contacted: number;
        responded: number;
      }
    >();

    // Aggregate by source
    for (const query of queries) {
      const existing = sourceStats.get(query.source) || {
        queries: 0,
        candidates: 0,
        totalRelevance: 0,
        contacted: 0,
        responded: 0,
      };
      existing.queries++;
      sourceStats.set(query.source, existing);
    }

    for (const candidate of sourcedCandidates) {
      const existing = sourceStats.get(candidate.source);
      if (existing) {
        existing.candidates++;
        existing.totalRelevance += candidate.relevanceScore;
        if (candidate.status === 'contacted') existing.contacted++;
        // Would track responded status too
      }
    }

    // Calculate metrics
    return Array.from(sourceStats.entries()).map(([source, stats]) => ({
      source,
      queriesRun: stats.queries,
      candidatesSourced: stats.candidates,
      avgRelevanceScore:
        stats.candidates > 0 ? stats.totalRelevance / stats.candidates : 0,
      conversionRate:
        stats.candidates > 0 ? stats.responded / stats.candidates : 0,
    }));
  }

  /**
   * Get recommended sources for a requisition
   */
  async recommendSources(
    requisition: JobRequisition,
    historicalData?: Array<{
      source: SourceType;
      conversionRate: number;
    }>
  ): Promise<Array<{ source: SourceType; priority: number; reason: string }>> {
    const reqExtended = requisition as unknown as {
      title: string;
      skills?: string[];
      level?: string;
    };

    // Default recommendations based on role type
    const titleLower = requisition.title.toLowerCase();

    const recommendations: Array<{
      source: SourceType;
      priority: number;
      reason: string;
    }> = [];

    // Engineering roles
    if (
      titleLower.includes('engineer') ||
      titleLower.includes('developer') ||
      titleLower.includes('programmer')
    ) {
      recommendations.push(
        { source: 'linkedin', priority: 1, reason: 'Primary professional network' },
        { source: 'github', priority: 2, reason: 'Technical portfolio visibility' },
        { source: 'stackoverflow', priority: 3, reason: 'Technical community presence' }
      );
    }

    // Startup roles
    if (titleLower.includes('startup') || reqExtended.level === 'startup') {
      recommendations.push({
        source: 'angellist',
        priority: 2,
        reason: 'Startup-focused talent pool',
      });
    }

    // Always include internal
    recommendations.push({
      source: 'internal_ats',
      priority: 1,
      reason: 'Past applicants and silver medalists',
    });

    // Adjust priorities based on historical data
    if (historicalData) {
      for (const rec of recommendations) {
        const historical = historicalData.find((h) => h.source === rec.source);
        if (historical && historical.conversionRate > 0.1) {
          rec.priority = Math.max(1, rec.priority - 1);
          rec.reason += ` (${(historical.conversionRate * 100).toFixed(0)}% historical conversion)`;
        }
      }
    }

    return recommendations.sort((a, b) => a.priority - b.priority);
  }

  // ===========================================================================
  // UNIPILE LINKEDIN SOURCING
  // ===========================================================================

  /**
   * Parse a job description and extract search criteria
   */
  async parseJobDescription(input: JobDescriptionInput): Promise<ParsedJobCriteria> {
    return this.jdParser.parse(input);
  }

  /**
   * Search LinkedIn via Unipile using parsed job criteria
   */
  async searchLinkedInViaUnipile(
    requisition: JobRequisition,
    criteria: ParsedJobCriteria,
    maxResults: number = 100
  ): Promise<SourcedCandidate[]> {
    if (!this.unipile) {
      console.log('[SourcingService] Unipile not available, returning mock data');
      return this.getMockLinkedInResults(requisition, criteria, maxResults);
    }

    const candidates: SourcedCandidate[] = [];
    const searchQueryId = uuid();

    try {
      // Build Unipile search params from criteria
      const searchParams: UnipileSearchParams = {
        api: criteria.recommendedApi,
        category: 'people',
        keywords: criteria.searchKeywords,
        title: criteria.titles,
        skills: criteria.requiredSkills.slice(0, 10), // Unipile limit
        location: criteria.locations,
        years_of_experience: {
          min: criteria.experienceYears.min,
          max: criteria.experienceYears.max,
        },
      };

      // Add company exclusions if provided
      if (criteria.excludeCompanies.length > 0) {
        searchParams.company = {
          exclude: criteria.excludeCompanies,
        };
      }

      // Execute search with pagination
      let totalFetched = 0;
      for await (const batch of this.unipile.searchProfilesIterator(searchParams, maxResults)) {
        for (const profile of batch) {
          const sourcedCandidate = this.unipileProfileToSourcedCandidate(
            profile,
            requisition.id,
            searchQueryId
          );

          // Score the candidate
          const score = await this.quickScoreCandidate(sourcedCandidate, criteria);
          sourcedCandidate.relevanceScore = score.relevance;
          sourcedCandidate.fitScore = score.fit;
          sourcedCandidate.sourcingNotes = score.notes;

          candidates.push(sourcedCandidate);
          totalFetched++;

          if (totalFetched >= maxResults) break;
        }
        if (totalFetched >= maxResults) break;
      }

      console.log(`[SourcingService] Found ${candidates.length} candidates from LinkedIn`);
    } catch (error) {
      console.error('[SourcingService] Unipile search failed:', error);
      throw error;
    }

    // Sort by relevance
    return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Execute a LinkedIn search with a direct boolean query
   */
  async searchLinkedInWithBoolean(
    requisition: JobRequisition,
    booleanQuery: string,
    maxResults: number = 50
  ): Promise<SourcedCandidate[]> {
    if (!this.unipile) {
      return this.getMockLinkedInResults(
        requisition,
        { booleanQuery } as ParsedJobCriteria,
        maxResults
      );
    }

    const searchQueryId = uuid();
    const candidates: SourcedCandidate[] = [];

    // Use URL-based search with the boolean query encoded
    const searchParams: UnipileSearchParams = {
      api: 'sales_navigator',
      category: 'people',
      keywords: booleanQuery,
    };

    for await (const batch of this.unipile.searchProfilesIterator(searchParams, maxResults)) {
      for (const profile of batch) {
        candidates.push(
          this.unipileProfileToSourcedCandidate(profile, requisition.id, searchQueryId)
        );
      }
    }

    return candidates;
  }

  /**
   * Get full profile details for a sourced candidate
   */
  async enrichLinkedInProfile(providerId: string): Promise<UnipileProfile | null> {
    if (!this.unipile) {
      return null;
    }

    return this.unipile.getProfile(providerId);
  }

  /**
   * Convert Unipile profile to sourced candidate
   */
  private unipileProfileToSourcedCandidate(
    profile: UnipileProfile,
    requisitionId: string,
    searchQueryId: string
  ): SourcedCandidate {
    return {
      id: uuid(),
      sourceId: profile.provider_id,
      source: 'linkedin',
      requisitionId,
      name: profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      headline: profile.headline,
      currentTitle: profile.current_title,
      currentCompany: profile.current_company,
      location: profile.location,
      profileUrl: profile.profile_url || `https://linkedin.com/in/${profile.public_identifier}`,
      relevanceScore: 0, // Will be set by scoring
      sourcingNotes: [],
      status: 'new',
      sourcedAt: new Date(),
      searchQueryId,
    };
  }

  /**
   * Quick scoring without full LLM call (for bulk ranking)
   */
  private async quickScoreCandidate(
    candidate: SourcedCandidate,
    criteria: ParsedJobCriteria
  ): Promise<{ relevance: number; fit: number; notes: string[] }> {
    let relevance = 50; // Base score
    const notes: string[] = [];

    // Title match
    const candidateTitle = (candidate.currentTitle || '').toLowerCase();
    for (const targetTitle of criteria.titles) {
      if (candidateTitle.includes(targetTitle.toLowerCase())) {
        relevance += 20;
        notes.push(`Title match: ${targetTitle}`);
        break;
      }
    }

    // Alternative title match
    for (const altTitle of criteria.alternativeTitles) {
      if (candidateTitle.includes(altTitle.toLowerCase())) {
        relevance += 10;
        notes.push(`Alt title match: ${altTitle}`);
        break;
      }
    }

    // Headline skill match
    const headline = (candidate.headline || '').toLowerCase();
    let skillMatches = 0;
    for (const skill of criteria.requiredSkills) {
      if (headline.includes(skill.toLowerCase())) {
        skillMatches++;
      }
    }
    if (skillMatches > 0) {
      relevance += Math.min(skillMatches * 5, 20);
      notes.push(`${skillMatches} skill matches in headline`);
    }

    // Company exclusion check
    const company = (candidate.currentCompany || '').toLowerCase();
    for (const excluded of criteria.excludeCompanies) {
      if (company.includes(excluded.toLowerCase())) {
        relevance -= 30;
        notes.push(`Warning: Current company is excluded`);
        break;
      }
    }

    // Target company bonus
    for (const target of criteria.targetCompanies) {
      if (company.includes(target.toLowerCase())) {
        relevance += 15;
        notes.push(`Works at target company: ${target}`);
        break;
      }
    }

    // Cap scores
    relevance = Math.min(100, Math.max(0, relevance));
    const fit = Math.round(relevance * 0.9); // Slightly lower fit estimate without deep analysis

    return { relevance, fit, notes };
  }

  /**
   * Mock LinkedIn results for demo/testing
   */
  private getMockLinkedInResults(
    requisition: JobRequisition,
    criteria: ParsedJobCriteria,
    maxResults: number
  ): SourcedCandidate[] {
    const searchQueryId = uuid();
    const mockNames = [
      'Sarah Chen', 'Michael Rodriguez', 'Emily Johnson', 'David Kim',
      'Jessica Martinez', 'James Wilson', 'Amanda Taylor', 'Christopher Lee',
      'Lauren Brown', 'Andrew Garcia', 'Megan Thompson', 'Daniel White',
    ];

    const mockCompanies = [
      'Google', 'Meta', 'Amazon', 'Microsoft', 'Apple',
      'Stripe', 'Airbnb', 'Uber', 'Netflix', 'Salesforce',
    ];

    const mockTitles = criteria.titles.length > 0
      ? criteria.titles
      : ['Senior Software Engineer', 'Staff Engineer', 'Tech Lead'];

    const results: SourcedCandidate[] = [];

    for (let i = 0; i < Math.min(maxResults, mockNames.length); i++) {
      const name = mockNames[i];
      const company = mockCompanies[i % mockCompanies.length];
      const title = mockTitles[i % mockTitles.length];

      results.push({
        id: uuid(),
        sourceId: `li-mock-${i}`,
        source: 'linkedin',
        requisitionId: requisition.id,
        name,
        headline: `${title} at ${company} | ${criteria.requiredSkills.slice(0, 3).join(', ')}`,
        currentTitle: title,
        currentCompany: company,
        location: criteria.locations[0] || 'San Francisco, CA',
        profileUrl: `https://linkedin.com/in/${name.toLowerCase().replace(' ', '-')}`,
        relevanceScore: Math.floor(70 + Math.random() * 25),
        fitScore: Math.floor(65 + Math.random() * 30),
        sourcingNotes: ['Mock candidate for demo'],
        status: 'new',
        sourcedAt: new Date(),
        searchQueryId,
      });
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: SourcingService | null = null;

export function getSourcingService(): SourcingService {
  if (!instance) {
    instance = new SourcingService();
  }
  return instance;
}

export function resetSourcingService(): void {
  instance = null;
}
