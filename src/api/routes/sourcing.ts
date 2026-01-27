/**
 * Sourcing API Routes - LinkedIn & GitHub Candidate Search
 *
 * Endpoints to trigger and manage candidate sourcing:
 * - Parse job descriptions
 * - Execute LinkedIn searches via Unipile
 * - Execute GitHub searches via GitHub API
 * - Get search results and progress
 * - Manage candidate pipeline
 */

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { getTenantIdFromRequest } from '../middleware/tenantMiddleware.js';
import { getSourcingService } from '../../domain/services/SourcingService.js';
import { getQueueManager } from '../../infrastructure/queue/TaskQueue.js';
import type { ParsedJobCriteria } from '../../domain/services/JobDescriptionParser.js';
import {
  isGitHubConfigured,
  getGitHubClient,
  getEmailExtractor,
  type GitHubCandidate,
} from '../../integrations/github/index.js';
import { getUnipileClient, initializeUnipileClient } from '../../integrations/linkedin/index.js';
import {
  getAIGitHubKeywordGenerator,
  generateGitHubKeywordsFallback,
  generateRoleProfile,
  generateRoleProfileFallback,
  type RoleProfile,
} from '../../domain/services/AIGitHubKeywordGenerator.js';

const router = Router();

// =============================================================================
// SCHEMAS
// =============================================================================

const parseJobDescriptionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  requirements: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  location: z.string().optional(),
  remoteType: z.enum(['onsite', 'remote', 'hybrid']).optional(),
  companyName: z.string().optional(),
  industry: z.string().optional(),
});

const searchLinkedInSchema = z.object({
  requisitionId: z.string().min(1),
  maxResults: z.number().int().positive().max(500).default(100),
  customCriteria: z.object({
    titles: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    excludeCompanies: z.array(z.string()).optional(),
    booleanQuery: z.string().optional(),
  }).optional(),
});

const booleanSearchSchema = z.object({
  requisitionId: z.string().min(1),
  booleanQuery: z.string().min(5),
  maxResults: z.number().int().positive().max(200).default(50),
});

const githubSearchSchema = z.object({
  requisitionId: z.string().optional(),
  language: z.string().optional(),
  location: z.string().optional(),
  followers: z.string().optional(), // e.g., ">100", "50..500"
  repos: z.string().optional(), // e.g., ">10"
  keywords: z.array(z.string()).optional(),
  maxResults: z.number().int().positive().max(100).default(50),
  extractEmails: z.boolean().default(true),
});

const resolveLinkedInProfilesSchema = z.object({
  candidates: z.array(z.object({
    id: z.string(),
    linkedinUrl: z.string().url(),
    name: z.string().optional(),
  })).max(20), // Limit batch size for rate limiting
  // Unipile config passed from frontend (stored in localStorage)
  unipileConfig: z.object({
    apiKey: z.string(),
    dsn: z.string(),
    port: z.string().optional(),
    accountId: z.string(),
  }).optional(),
});

// =============================================================================
// IN-MEMORY STORAGE (would be Redis/DB in production)
// =============================================================================

interface SearchRun {
  id: string;
  tenantId: string;
  requisitionId: string;
  source: 'linkedin' | 'github';
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  totalFound: number;
  candidates: Array<{
    id: string;
    name: string;
    headline?: string;
    currentTitle?: string;
    currentCompany?: string;
    location?: string;
    profileUrl: string;
    relevanceScore: number;
    fitScore?: number;
    status: string;
    // GitHub-specific fields
    email?: string;
    emailSource?: string;
    githubUsername?: string;
    topLanguages?: string[];
  }>;
  criteria?: ParsedJobCriteria;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const searchRuns = new Map<string, SearchRun>();

// GitHub search runs stored separately
interface GitHubSearchRun {
  id: string;
  tenantId: string;
  requisitionId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  totalFound: number;
  candidates: GitHubCandidate[];
  query: {
    language?: string;
    location?: string;
    followers?: string;
    repos?: string;
    keywords?: string[];
  };
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const githubSearchRuns = new Map<string, GitHubSearchRun>();

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /sourcing/parse-jd - Parse job description to search criteria
 */
router.post('/parse-jd', async (req, res, next) => {
  try {
    const input = parseJobDescriptionSchema.parse(req.body);

    const sourcingService = getSourcingService();
    const criteria = await sourcingService.parseJobDescription(input);

    res.json({
      success: true,
      criteria,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /sourcing/search - Start a LinkedIn search
 */
router.post('/search', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { requisitionId, maxResults, customCriteria } = searchLinkedInSchema.parse(req.body);

    const runId = uuid();

    // Create search run record
    const run: SearchRun = {
      id: runId,
      tenantId,
      requisitionId,
      source: 'linkedin',
      status: 'queued',
      progress: 0,
      totalFound: 0,
      candidates: [],
      startedAt: new Date(),
    };
    searchRuns.set(runId, run);

    // Queue the search job (async execution)
    const queueManager = getQueueManager();
    await queueManager.addTask({
      id: runId,
      tenantId,
      type: 'LINKEDIN_SEARCH',
      payload: {
        requisitionId,
        maxResults,
        customCriteria,
      },
      priority: 'MEDIUM',
    });

    // Start the search in background
    executeSearch(runId, tenantId, requisitionId, maxResults, customCriteria).catch((err) => {
      console.error(`[Sourcing] Search ${runId} failed:`, err);
      const run = searchRuns.get(runId);
      if (run) {
        run.status = 'failed';
        run.error = err.message;
      }
    });

    res.json({
      runId,
      status: 'queued',
      message: `LinkedIn search started for requisition ${requisitionId}`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /sourcing/search/boolean - Search with a custom boolean query
 */
router.post('/search/boolean', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { requisitionId, booleanQuery, maxResults } = booleanSearchSchema.parse(req.body);

    const runId = uuid();

    // Create search run record
    const run: SearchRun = {
      id: runId,
      tenantId,
      requisitionId,
      source: 'linkedin',
      status: 'queued',
      progress: 0,
      totalFound: 0,
      candidates: [],
      startedAt: new Date(),
    };
    searchRuns.set(runId, run);

    // Execute boolean search in background
    executeBooleanSearch(runId, tenantId, requisitionId, booleanQuery, maxResults).catch((err) => {
      console.error(`[Sourcing] Boolean search ${runId} failed:`, err);
      const run = searchRuns.get(runId);
      if (run) {
        run.status = 'failed';
        run.error = err.message;
      }
    });

    res.json({
      runId,
      status: 'queued',
      message: `Boolean search started: ${booleanQuery.slice(0, 50)}...`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sourcing/results/:runId - Get search results
 */
router.get('/results/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = searchRuns.get(runId);

    if (!run) {
      return res.status(404).json({
        error: 'Search run not found',
      });
    }

    res.json({
      id: run.id,
      status: run.status,
      progress: run.progress,
      totalFound: run.totalFound,
      candidates: run.candidates,
      criteria: run.criteria,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sourcing/runs - List all search runs for tenant
 */
router.get('/runs', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const runs = Array.from(searchRuns.values())
      .filter((run) => run.tenantId === tenantId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20); // Last 20 runs

    res.json({
      runs: runs.map((run) => ({
        id: run.id,
        requisitionId: run.requisitionId,
        status: run.status,
        totalFound: run.totalFound,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// GITHUB SEARCH ROUTES
// =============================================================================

/**
 * GET /sourcing/github/status - Check if GitHub sourcing is available
 */
router.get('/github/status', async (req, res) => {
  const configured = isGitHubConfigured();

  res.json({
    available: configured,
    message: configured
      ? 'GitHub sourcing is configured and available'
      : 'GitHub sourcing requires GITHUB_TOKEN environment variable',
  });
});

/**
 * POST /sourcing/github/generate-keywords - Use AI to generate optimal GitHub search keywords
 */
router.post('/github/generate-keywords', async (req, res, next) => {
  try {
    const { jobTitle, jobDescription, requiredSkills, preferredSkills, intakeNotes, existingSearchStrategy } = req.body;

    if (!jobTitle) {
      return res.status(400).json({
        error: 'Job title is required',
      });
    }

    const input = {
      jobTitle,
      jobDescription,
      requiredSkills,
      preferredSkills,
      intakeNotes,
      existingSearchStrategy,
    };

    // Try AI generation, fall back to quick/basic generation if AI fails
    let result: {
      primaryKeywords: string[];
      secondaryKeywords: string[];
      suggestedLanguage: string;
      alternativeLanguages: string[];
      reasoning: string;
      confidence: number;
    };
    try {
      // This may throw if ANTHROPIC_API_KEY is not set
      const generator = getAIGitHubKeywordGenerator();
      result = await generator.generateKeywords(input);
    } catch (aiError) {
      console.warn('[Sourcing] AI keyword generation failed, using fallback:', aiError);
      // Use static fallback function that doesn't require Claude client
      result = generateGitHubKeywordsFallback(input);
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Sourcing] GitHub keyword generation failed:', error);
    next(error);
  }
});

/**
 * POST /sourcing/github/role-profile - Generate semantic role profile for title matching
 *
 * Riley understands what characteristics define a role and generates a profile
 * of signals to look for in GitHub bios. This enables semantic matching rather
 * than naive keyword matching.
 *
 * Example: For "Senior Site Reliability Engineer", instead of just matching
 * "engineer", Riley looks for signals like "sre", "platform", "infrastructure",
 * "kubernetes", "reliability", "observability", etc.
 */
router.post('/github/role-profile', async (req, res, next) => {
  try {
    const { jobTitle } = req.body;

    if (!jobTitle || typeof jobTitle !== 'string') {
      return res.status(400).json({
        error: 'Job title is required',
      });
    }

    console.log('[Sourcing] Generating role profile for:', jobTitle);

    // Try AI generation, fall back to heuristic if AI fails
    let roleProfile: RoleProfile;
    try {
      roleProfile = await generateRoleProfile(jobTitle);
      console.log('[Sourcing] AI role profile generated:', roleProfile.identityTerms.slice(0, 3));
    } catch (aiError) {
      console.warn('[Sourcing] AI role profile generation failed, using fallback:', aiError);
      roleProfile = generateRoleProfileFallback(jobTitle);
    }

    res.json({
      success: true,
      ...roleProfile,
    });
  } catch (error) {
    console.error('[Sourcing] Role profile generation failed:', error);
    next(error);
  }
});

/**
 * POST /sourcing/linkedin/resolve-profiles - Resolve LinkedIn URLs to provider IDs
 *
 * This endpoint takes GitHub candidates with LinkedIn URLs and resolves them
 * to full LinkedIn profiles with provider_id (required for messaging via Unipile).
 *
 * Used for adding GitHub-sourced candidates to the LinkedIn messaging queue.
 */
router.post('/linkedin/resolve-profiles', async (req, res, next) => {
  try {
    const { candidates, unipileConfig } = resolveLinkedInProfilesSchema.parse(req.body);

    // Get or initialize Unipile client
    let client;
    try {
      // If config is provided in request body, use it to initialize
      if (unipileConfig) {
        client = initializeUnipileClient({
          apiKey: unipileConfig.apiKey,
          dsn: unipileConfig.dsn,
          port: unipileConfig.port,
          accountId: unipileConfig.accountId,
        });
      } else {
        // Try to get existing singleton instance
        client = getUnipileClient();
      }
    } catch {
      return res.status(503).json({
        success: false,
        error: 'LinkedIn integration not configured',
        message: 'Unipile client not initialized. Please provide unipileConfig in the request or check UNIPILE_API_KEY, UNIPILE_DSN, and UNIPILE_ACCOUNT_ID.',
      });
    }

    console.log(`[Sourcing] Resolving ${candidates.length} LinkedIn profiles from URLs`);

    const resolved: Array<{
      id: string;
      providerId: string;
      name: string;
      headline?: string;
      currentTitle?: string;
      currentCompany?: string;
      location?: string;
      profileUrl: string;
      profilePictureUrl?: string;
    }> = [];

    const failed: Array<{
      id: string;
      name?: string;
      error: string;
      linkedinUrl: string;
    }> = [];

    for (const candidate of candidates) {
      try {
        console.log(`[Sourcing] Looking up LinkedIn profile: ${candidate.linkedinUrl}`);

        // Use getProfileByPublicId which handles URL cleaning and lookup
        const profile = await client.getProfileByPublicId(candidate.linkedinUrl);

        if (profile && profile.provider_id) {
          resolved.push({
            id: candidate.id,
            providerId: profile.provider_id,
            name: profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || candidate.name || 'Unknown',
            headline: profile.headline,
            currentTitle: profile.current_title,
            currentCompany: profile.current_company,
            location: profile.location,
            profileUrl: profile.profile_url || candidate.linkedinUrl,
            profilePictureUrl: profile.profile_picture_url,
          });
          console.log(`[Sourcing] Resolved ${candidate.linkedinUrl} -> ${profile.provider_id}`);
        } else {
          failed.push({
            id: candidate.id,
            name: candidate.name,
            error: 'Profile not found or no provider_id',
            linkedinUrl: candidate.linkedinUrl,
          });
          console.log(`[Sourcing] Failed to resolve ${candidate.linkedinUrl}: no profile or provider_id`);
        }

        // Rate limiting delay between lookups
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        failed.push({
          id: candidate.id,
          name: candidate.name,
          error: errorMsg,
          linkedinUrl: candidate.linkedinUrl,
        });
        console.error(`[Sourcing] Error resolving ${candidate.linkedinUrl}:`, errorMsg);
      }
    }

    console.log(`[Sourcing] Profile resolution complete: ${resolved.length} resolved, ${failed.length} failed`);

    res.json({
      success: true,
      resolved,
      failed,
      summary: {
        total: candidates.length,
        resolved: resolved.length,
        failed: failed.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /sourcing/github/search - Search GitHub for developers
 */
router.post('/github/search', async (req, res, next) => {
  try {
    if (!isGitHubConfigured()) {
      return res.status(503).json({
        error: 'GitHub sourcing not configured',
        message: 'Set GITHUB_TOKEN environment variable to enable GitHub sourcing',
      });
    }

    const tenantId = getTenantIdFromRequest(req);
    const input = githubSearchSchema.parse(req.body);

    const runId = uuid();

    // Create GitHub search run record
    const run: GitHubSearchRun = {
      id: runId,
      tenantId,
      requisitionId: input.requisitionId,
      status: 'queued',
      progress: 0,
      totalFound: 0,
      candidates: [],
      query: {
        language: input.language,
        location: input.location,
        followers: input.followers,
        repos: input.repos,
        keywords: input.keywords,
      },
      startedAt: new Date(),
    };
    githubSearchRuns.set(runId, run);

    // Execute GitHub search in background
    executeGitHubSearch(runId, input.maxResults, input.extractEmails).catch((err) => {
      console.error(`[Sourcing] GitHub search ${runId} failed:`, err);
      const run = githubSearchRuns.get(runId);
      if (run) {
        run.status = 'failed';
        run.error = err.message;
      }
    });

    res.json({
      runId,
      status: 'queued',
      message: `GitHub search started`,
      query: run.query,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sourcing/github/results/:runId - Get GitHub search results
 */
router.get('/github/results/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = githubSearchRuns.get(runId);

    if (!run) {
      return res.status(404).json({
        error: 'GitHub search run not found',
      });
    }

    res.json({
      id: run.id,
      status: run.status,
      progress: run.progress,
      totalFound: run.totalFound,
      candidates: run.candidates,
      query: run.query,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sourcing/github/runs - List all GitHub search runs for tenant
 */
router.get('/github/runs', async (req, res, next) => {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const runs = Array.from(githubSearchRuns.values())
      .filter((run) => run.tenantId === tenantId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 20);

    res.json({
      runs: runs.map((run) => ({
        id: run.id,
        requisitionId: run.requisitionId,
        status: run.status,
        totalFound: run.totalFound,
        query: run.query,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /sourcing/runs/:runId - Cancel a running search
 */
router.delete('/runs/:runId', async (req, res, next) => {
  try {
    const { runId } = req.params;
    const run = searchRuns.get(runId);

    if (!run) {
      return res.status(404).json({
        error: 'Search run not found',
      });
    }

    if (run.status === 'running') {
      run.status = 'failed';
      run.error = 'Cancelled by user';
    }

    searchRuns.delete(runId);

    res.json({
      success: true,
      message: 'Search run deleted',
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PROFILE SCORING - Score a single LinkedIn profile against a job
// =============================================================================

/**
 * POST /sourcing/score-profile - Score a LinkedIn profile URL against job criteria
 *
 * Fetches the profile via Unipile and scores it using the AI sourcing scorer.
 * Requires the job role parameters to score against.
 */
router.post('/score-profile', async (req, res, next) => {
  try {
    const {
      linkedinUrl,
      role,
    } = req.body;

    if (!linkedinUrl || typeof linkedinUrl !== 'string') {
      return res.status(400).json({
        error: 'linkedinUrl is required',
      });
    }

    if (!role || !role.title) {
      return res.status(400).json({
        error: 'role object with at least a title is required',
      });
    }

    // Get Unipile client
    const unipileClient = getUnipileClient();
    if (!unipileClient) {
      return res.status(503).json({
        error: 'LinkedIn integration not configured. Please set up Unipile in settings.',
      });
    }

    console.log(`[Sourcing] Scoring profile: ${linkedinUrl}`);

    // Fetch the profile via Unipile
    const profile = await unipileClient.getProfileByPublicId(linkedinUrl);

    if (!profile) {
      return res.status(404).json({
        error: 'Could not find LinkedIn profile. Please check the URL is correct.',
      });
    }

    console.log(`[Sourcing] Found profile: ${profile.name || profile.first_name} at ${profile.current_company}`);

    // Transform Unipile profile to CandidateInput format
    const { AISourcingScorer, resetAISourcingScorer } = await import(
      '../../domain/services/AISourcingScorer.js'
    );

    // Check for API key - use header or env
    const headerApiKey = req.headers['x-anthropic-api-key'] as string | undefined;
    const envApiKey = process.env.ANTHROPIC_API_KEY;

    if (headerApiKey && !envApiKey) {
      process.env.ANTHROPIC_API_KEY = headerApiKey;
    }

    // Reset scorer to pick up new API key
    resetAISourcingScorer();
    const scorer = new AISourcingScorer();

    // Normalize skills - handle both string[] and {name: string}[] formats
    const normalizeSkills = (skills: string[] | Array<{ name: string }> | undefined): string[] => {
      if (!skills) return [];
      return skills.map((s) => (typeof s === 'string' ? s : s.name));
    };

    // Transform experiences - handle both formats
    // Using inline types since Unipile types are complex
    type ProfileWithExperiences = {
      experiences?: Array<{
        title: string;
        company_name: string;
        start_date?: string;
        end_date?: string;
        is_current?: boolean;
        description?: string;
      }>;
      work_experience?: Array<{
        position?: string;
        company?: string;
        start?: string;
        end?: string;
        description?: string;
      }>;
    };

    const transformExperiences = (profileData: ProfileWithExperiences) => {
      // Try the experiences array first (normalized format)
      if (profileData.experiences && profileData.experiences.length > 0) {
        return profileData.experiences.map((exp) => ({
          title: exp.title,
          company: exp.company_name,
          startDate: exp.start_date,
          endDate: exp.end_date,
          isCurrent: exp.is_current,
          description: exp.description,
        }));
      }

      // Fall back to work_experience (raw API format)
      if (profileData.work_experience && profileData.work_experience.length > 0) {
        return profileData.work_experience.map((exp) => ({
          title: exp.position || 'Unknown',
          company: exp.company || 'Unknown',
          startDate: exp.start,
          endDate: exp.end,
          isCurrent: !exp.end,
          description: exp.description,
        }));
      }

      return [];
    };

    const candidateInput = {
      id: profile.provider_id,
      name: profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown',
      currentTitle: profile.current_title || profile.headline?.split(' at ')[0] || 'Unknown',
      currentCompany: profile.current_company || profile.headline?.split(' at ')[1]?.split(' |')[0] || 'Unknown',
      headline: profile.headline,
      location: profile.location,
      summary: profile.summary,
      experiences: transformExperiences(profile as any),
      skills: normalizeSkills(profile.skills),
    };

    // Score the candidate
    const score = await scorer.scoreCandidate(candidateInput, {
      title: role.title,
      companySize: role.companySize,
      location: role.isFullyRemote ? 'Fully Remote' : (role.location || 'Remote'),
      levelContext: role.levelContext,
      industry: role.industry,
      teamSize: role.teamSize,
      technical: role.technical,
      intakeNotes: role.intakeNotes,
      isFullyRemote: role.isFullyRemote,
      searchContext: role.searchContext,
    });

    // Clean up temporary API key
    if (headerApiKey && !envApiKey) {
      delete process.env.ANTHROPIC_API_KEY;
    }

    console.log(`[Sourcing] Profile scored: ${score.overallScore} (${score.recommendation})`);

    res.json({
      success: true,
      profile: {
        id: profile.provider_id,
        name: candidateInput.name,
        headline: profile.headline,
        currentTitle: candidateInput.currentTitle,
        currentCompany: candidateInput.currentCompany,
        location: profile.location,
        profileUrl: profile.profile_url || `https://www.linkedin.com/in/${profile.public_identifier}`,
        profilePictureUrl: profile.profile_picture_url,
        summary: profile.summary,
        experienceCount: candidateInput.experiences?.length || 0,
        skillCount: candidateInput.skills?.length || 0,
      },
      score,
    });
  } catch (error) {
    console.error('[Sourcing] Error scoring profile:', error);
    next(error);
  }
});

// =============================================================================
// BACKGROUND EXECUTION
// =============================================================================

async function executeSearch(
  runId: string,
  tenantId: string,
  requisitionId: string,
  maxResults: number,
  customCriteria?: {
    titles?: string[];
    skills?: string[];
    locations?: string[];
    excludeCompanies?: string[];
    booleanQuery?: string;
  }
): Promise<void> {
  const run = searchRuns.get(runId);
  if (!run) return;

  run.status = 'running';
  run.progress = 10;

  try {
    const sourcingService = getSourcingService();

    // Build criteria from custom input or fetch from requisition
    const criteria: ParsedJobCriteria = {
      titles: customCriteria?.titles || ['Software Engineer'],
      alternativeTitles: [],
      keywords: [],
      requiredSkills: customCriteria?.skills || [],
      preferredSkills: [],
      technicalKeywords: [],
      experienceYears: { min: 0, max: 20 },
      seniorityLevel: 'mid',
      locations: customCriteria?.locations || [],
      remoteOk: true,
      industries: [],
      targetCompanies: [],
      excludeCompanies: customCriteria?.excludeCompanies || [],
      booleanQuery: customCriteria?.booleanQuery || '',
      searchKeywords: customCriteria?.titles?.join(' ') || 'Software Engineer',
      recommendedApi: 'sales_navigator',
      confidence: 0.8,
      notes: [],
    };

    run.criteria = criteria;
    run.progress = 30;

    // Mock requisition object
    const mockRequisition = {
      id: requisitionId,
      tenantId,
      title: criteria.titles[0] || 'Open Position',
      description: '',
      requirements: [],
      preferredSkills: [],
      status: 'OPEN' as const,
      priority: 'MEDIUM' as const,
      interviewStages: [],
      openedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Execute LinkedIn search
    const candidates = await sourcingService.searchLinkedInViaUnipile(
      mockRequisition as any,
      criteria,
      maxResults
    );

    run.progress = 90;

    // Store results
    run.candidates = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      headline: c.headline,
      currentTitle: c.currentTitle,
      currentCompany: c.currentCompany,
      location: c.location,
      profileUrl: c.profileUrl,
      relevanceScore: c.relevanceScore,
      fitScore: c.fitScore,
      status: c.status,
    }));

    run.totalFound = candidates.length;
    run.status = 'completed';
    run.progress = 100;
    run.completedAt = new Date();

    console.log(`[Sourcing] Search ${runId} completed with ${candidates.length} candidates`);
  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Sourcing] Search ${runId} failed:`, error);
  }
}

async function executeBooleanSearch(
  runId: string,
  tenantId: string,
  requisitionId: string,
  booleanQuery: string,
  maxResults: number
): Promise<void> {
  const run = searchRuns.get(runId);
  if (!run) return;

  run.status = 'running';
  run.progress = 20;

  try {
    const sourcingService = getSourcingService();

    const mockRequisition = {
      id: requisitionId,
      tenantId,
      title: 'Boolean Search',
      description: booleanQuery,
      requirements: [],
      preferredSkills: [],
      status: 'OPEN' as const,
      priority: 'MEDIUM' as const,
      interviewStages: [],
      openedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    run.progress = 50;

    const candidates = await sourcingService.searchLinkedInWithBoolean(
      mockRequisition as any,
      booleanQuery,
      maxResults
    );

    run.candidates = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      headline: c.headline,
      currentTitle: c.currentTitle,
      currentCompany: c.currentCompany,
      location: c.location,
      profileUrl: c.profileUrl,
      relevanceScore: c.relevanceScore,
      fitScore: c.fitScore,
      status: c.status,
    }));

    run.totalFound = candidates.length;
    run.status = 'completed';
    run.progress = 100;
    run.completedAt = new Date();
  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : 'Unknown error';
  }
}

// =============================================================================
// GITHUB SEARCH EXECUTION
// =============================================================================

async function executeGitHubSearch(
  runId: string,
  maxResults: number,
  extractEmails: boolean
): Promise<void> {
  const run = githubSearchRuns.get(runId);
  if (!run) return;

  run.status = 'running';
  run.progress = 10;

  try {
    const client = getGitHubClient();
    const emailExtractor = getEmailExtractor();

    // Build search query
    const searchQuery = {
      language: run.query.language,
      location: run.query.location,
      followers: run.query.followers,
      repos: run.query.repos,
      keywords: run.query.keywords,
    };

    console.log(`[Sourcing] GitHub search ${runId} starting with query:`, searchQuery);

    run.progress = 20;

    // Execute search
    const searchResults = await client.searchUsers(searchQuery);
    run.progress = 40;

    console.log(`[Sourcing] GitHub search ${runId} found ${searchResults.totalCount} users`);

    // Enrich top candidates with full profile and email
    const candidatesToEnrich = searchResults.items.slice(0, maxResults);
    const enrichedCandidates: GitHubCandidate[] = [];

    for (let i = 0; i < candidatesToEnrich.length; i++) {
      const user = candidatesToEnrich[i];
      run.progress = 40 + Math.round((i / candidatesToEnrich.length) * 50);

      try {
        // Get full candidate profile with email
        const candidate = await client.enrichCandidate(user.login);
        if (candidate) {
          // If we should extract emails and candidate doesn't have one, try harder
          if (extractEmails && !candidate.email) {
            const emailResult = await emailExtractor.extractEmail(user.login);
            if (emailResult.email) {
              candidate.email = emailResult.email;
              candidate.emailSource = emailResult.source;
              candidate.emailConfidence = emailResult.confidence;
            }
          }
          enrichedCandidates.push(candidate);
        }
      } catch (error) {
        console.warn(`[Sourcing] Failed to enrich GitHub user ${user.login}:`, error);
      }

      // Rate limiting delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    run.candidates = enrichedCandidates;
    run.totalFound = enrichedCandidates.length;
    run.status = 'completed';
    run.progress = 100;
    run.completedAt = new Date();

    console.log(
      `[Sourcing] GitHub search ${runId} completed with ${enrichedCandidates.length} candidates`
    );
  } catch (error) {
    run.status = 'failed';
    run.error = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Sourcing] GitHub search ${runId} failed:`, error);
  }
}

export default router;
