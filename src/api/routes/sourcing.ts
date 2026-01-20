/**
 * Sourcing API Routes - LinkedIn Candidate Search
 *
 * Endpoints to trigger and manage LinkedIn sourcing:
 * - Parse job descriptions
 * - Execute LinkedIn searches via Unipile
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

// =============================================================================
// IN-MEMORY STORAGE (would be Redis/DB in production)
// =============================================================================

interface SearchRun {
  id: string;
  tenantId: string;
  requisitionId: string;
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
  }>;
  criteria?: ParsedJobCriteria;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

const searchRuns = new Map<string, SearchRun>();

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

export default router;
