/**
 * Analytics API Routes
 *
 * Provides real metrics and analytics from the database.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.js';

const router = Router();

/**
 * GET /api/analytics - Get real analytics data from the database
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as { tenantId?: string }).tenantId || 'development';
    const period = req.query.period as string || '30d';

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get task counts
    const [totalTasks, approvedTasks, rejectedTasks, pendingTasks] = await Promise.all([
      prisma.task.count({
        where: {
          tenantId,
          createdAt: { gte: startDate },
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: 'APPROVED',
          createdAt: { gte: startDate },
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: 'REJECTED',
          createdAt: { gte: startDate },
        },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: 'PENDING_APPROVAL',
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // Get candidate counts by stage
    const [
      sourcedCandidates,
      contactedCandidates,
      respondedCandidates,
      screenedCandidates,
      interviewedCandidates,
    ] = await Promise.all([
      prisma.candidate.count({
        where: {
          tenantId,
          createdAt: { gte: startDate },
        },
      }),
      prisma.candidate.count({
        where: {
          tenantId,
          stage: { in: ['CONTACTED', 'RESPONDED', 'SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWING', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'HIRED'] },
          createdAt: { gte: startDate },
        },
      }),
      prisma.candidate.count({
        where: {
          tenantId,
          stage: { in: ['RESPONDED', 'SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWING', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'HIRED'] },
          createdAt: { gte: startDate },
        },
      }),
      prisma.candidate.count({
        where: {
          tenantId,
          stage: { in: ['SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWING', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'HIRED'] },
          createdAt: { gte: startDate },
        },
      }),
      prisma.candidate.count({
        where: {
          tenantId,
          stage: { in: ['INTERVIEW_SCHEDULED', 'INTERVIEWING', 'OFFER_EXTENDED', 'OFFER_ACCEPTED', 'HIRED'] },
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // Get outreach tracker stats
    const [
      totalOutreach,
      repliedOutreach,
      scheduledConversations,
    ] = await Promise.all([
      prisma.outreachTracker.count({
        where: {
          tenantId,
          createdAt: { gte: startDate },
        },
      }),
      prisma.outreachTracker.count({
        where: {
          tenantId,
          status: 'REPLIED',
          createdAt: { gte: startDate },
        },
      }),
      prisma.rileyConversation.count({
        where: {
          stage: 'SCHEDULED',
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // Get Riley conversation stats
    const conversationStats = await prisma.rileyConversation.groupBy({
      by: ['stage'],
      _count: true,
      where: {
        createdAt: { gte: startDate },
      },
    });

    // Calculate metrics
    const responseRate = totalOutreach > 0 ? repliedOutreach / totalOutreach : 0;
    const approvalRate = totalTasks > 0 ? approvedTasks / totalTasks : 0;

    // Get average approval time (tasks that have been approved)
    const approvedTasksWithTime = await prisma.task.findMany({
      where: {
        tenantId,
        status: 'APPROVED',
        approvedAt: { not: null },
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        approvedAt: true,
      },
    });

    let avgApprovalTime = 0;
    if (approvedTasksWithTime.length > 0) {
      const totalTime = approvedTasksWithTime.reduce((sum, task) => {
        if (task.approvedAt) {
          return sum + (task.approvedAt.getTime() - task.createdAt.getTime());
        }
        return sum;
      }, 0);
      avgApprovalTime = totalTime / approvedTasksWithTime.length / 60000; // Convert to minutes
    }

    // Get weekly trends (last 7 days)
    const weeklyTrends = await getWeeklyTrends(tenantId);

    // Get escalation breakdown
    const escalationBreakdown = await prisma.task.groupBy({
      by: ['escalationReason'],
      _count: true,
      where: {
        tenantId,
        escalationReason: { not: null },
        createdAt: { gte: startDate },
      },
    });

    // Get Guidelines evolution
    const guidelinesVersions = await prisma.guidelines.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
      take: 5,
      select: {
        version: true,
        status: true,
        createdBy: true,
        changelog: true,
        createdAt: true,
      },
    });

    // Get Criteria evolution
    const criteriaVersions = await prisma.criteria.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
      take: 5,
      select: {
        version: true,
        status: true,
        createdBy: true,
        changelog: true,
        createdAt: true,
      },
    });

    // Get template performance
    const templateStats = await prisma.outreachTemplate.findMany({
      where: {
        tenantId,
        useCount: { gt: 0 },
      },
      orderBy: { responseRate: 'desc' },
      take: 5,
      select: {
        name: true,
        useCount: true,
        responseRate: true,
      },
    });

    return res.json({
      success: true,
      data: {
        period,
        tasks: {
          total: totalTasks,
          approved: approvedTasks,
          rejected: rejectedTasks,
          pending: pendingTasks,
        },
        candidates: {
          sourced: sourcedCandidates,
          contacted: contactedCandidates,
          responded: respondedCandidates,
          screened: screenedCandidates,
          interviewed: interviewedCandidates,
        },
        outreach: {
          total: totalOutreach,
          replied: repliedOutreach,
          scheduled: scheduledConversations,
        },
        metrics: {
          responseRate,
          approvalRate,
          avgApprovalTime, // in minutes
          avgTimeToResponse: 48, // TODO: Calculate from actual response times
        },
        trends: weeklyTrends,
        conversationsByStage: conversationStats.reduce((acc, item) => {
          acc[item.stage] = item._count;
          return acc;
        }, {} as Record<string, number>),
        escalationBreakdown: escalationBreakdown.map(item => ({
          reason: item.escalationReason || 'Unknown',
          count: item._count,
        })),
        guidelinesEvolution: guidelinesVersions.map(g => ({
          version: g.version,
          status: g.status,
          createdBy: g.createdBy,
          changelog: g.changelog,
          createdAt: g.createdAt.toISOString(),
        })),
        criteriaEvolution: criteriaVersions.map(c => ({
          version: c.version,
          status: c.status,
          createdBy: c.createdBy,
          changelog: c.changelog,
          createdAt: c.createdAt.toISOString(),
        })),
        topTemplates: templateStats.map(t => ({
          name: t.name,
          uses: t.useCount,
          responseRate: t.responseRate || 0,
        })),
      },
    });
  } catch (error) {
    console.error('[Analytics] Error fetching analytics:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch analytics',
    });
  }
});

/**
 * Get weekly trends for the last 7 days
 */
async function getWeeklyTrends(tenantId: string): Promise<{
  tasksThisWeek: number[];
  responsesThisWeek: number[];
  outreachThisWeek: number[];
}> {
  const now = new Date();
  const tasksThisWeek: number[] = [];
  const responsesThisWeek: number[] = [];
  const outreachThisWeek: number[] = [];

  // Get counts for each of the last 7 days
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const [taskCount, outreachCount, responseCount] = await Promise.all([
      prisma.task.count({
        where: {
          tenantId,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      prisma.outreachTracker.count({
        where: {
          tenantId,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
      }),
      prisma.outreachTracker.count({
        where: {
          tenantId,
          status: 'REPLIED',
          updatedAt: { gte: dayStart, lte: dayEnd },
        },
      }),
    ]);

    tasksThisWeek.push(taskCount);
    outreachThisWeek.push(outreachCount);
    responsesThisWeek.push(responseCount);
  }

  return {
    tasksThisWeek,
    responsesThisWeek,
    outreachThisWeek,
  };
}

/**
 * GET /api/analytics/tenants - Get tenant statistics
 */
router.get('/tenants', async (_req: Request, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            candidates: true,
            tasks: true,
            jobRequisitions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate approval rates for each tenant
    const tenantsWithStats = await Promise.all(
      tenants.map(async (tenant) => {
        const [approvedCount, totalCount] = await Promise.all([
          prisma.task.count({
            where: { tenantId: tenant.id, status: 'APPROVED' },
          }),
          prisma.task.count({
            where: { tenantId: tenant.id },
          }),
        ]);

        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          createdAt: tenant.createdAt,
          stats: {
            candidates: tenant._count.candidates,
            tasks: tenant._count.tasks,
            jobRequisitions: tenant._count.jobRequisitions,
            approvalRate: totalCount > 0 ? approvedCount / totalCount : 0,
          },
        };
      })
    );

    return res.json({
      success: true,
      tenants: tenantsWithStats,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching tenant stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch tenant stats',
    });
  }
});

/**
 * GET /api/analytics/activity - Get recent activity feed from real data
 */
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as { tenantId?: string }).tenantId || 'development';
    const limit = parseInt(req.query.limit as string) || 10;

    // Get recent tasks
    const recentTasks = await prisma.task.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    });

    // Get recent outreach activity
    const recentOutreach = await prisma.outreachTracker.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        candidateName: true,
        status: true,
        outreachType: true,
        updatedAt: true,
      },
    });

    // Get recent conversations
    const recentConversations = await prisma.rileyConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        candidateName: true,
        stage: true,
        lastMessageAt: true,
      },
    });

    // Combine and format activity
    const activities = [
      ...recentTasks.map(task => ({
        id: task.id,
        type: 'task',
        action: formatTaskAction(task.type, task.status),
        target: extractTargetFromPayload(task.payload),
        time: task.createdAt,
      })),
      ...recentOutreach.map(outreach => ({
        id: outreach.id,
        type: 'outreach',
        action: formatOutreachAction(outreach.status, outreach.outreachType),
        target: outreach.candidateName || 'Unknown candidate',
        time: outreach.updatedAt,
      })),
      ...recentConversations.map(conv => ({
        id: conv.id,
        type: 'conversation',
        action: formatConversationAction(conv.stage),
        target: conv.candidateName || 'Unknown candidate',
        time: conv.lastMessageAt || new Date(),
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit);

    return res.json({
      success: true,
      activities,
    });
  } catch (error) {
    console.error('[Analytics] Error fetching activity:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch activity',
    });
  }
});

// Helper functions for formatting activity
function formatTaskAction(type: string, status: string): string {
  const typeLabels: Record<string, string> = {
    SEND_EMAIL: 'Sent email to',
    SEND_LINKEDIN_MESSAGE: 'Sent LinkedIn message to',
    SEND_FOLLOW_UP: 'Sent follow-up to',
    SEARCH_CANDIDATES: 'Searched for candidates',
    IMPORT_CANDIDATE: 'Imported candidate',
    SCREEN_RESUME: 'Screened resume for',
    GENERATE_ASSESSMENT: 'Generated assessment for',
    SCHEDULE_INTERVIEW: 'Scheduled interview with',
    UPDATE_GUIDELINES: 'Updated guidelines',
  };

  const statusSuffix = status === 'PENDING_APPROVAL' ? ' (pending)' : '';
  return (typeLabels[type] || `Task: ${type}`) + statusSuffix;
}

function extractTargetFromPayload(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    return (p.candidateName as string) || (p.name as string) || (p.email as string) || 'candidate';
  }
  return 'candidate';
}

function formatOutreachAction(status: string, type: string): string {
  const actions: Record<string, string> = {
    SENT: `Sent ${type.toLowerCase().replace('_', ' ')} to`,
    CONNECTION_ACCEPTED: 'Connection accepted by',
    PITCH_SENT: 'Sent pitch to',
    REPLIED: 'Received reply from',
    NO_RESPONSE: 'No response from',
  };
  return actions[status] || `Outreach: ${status}`;
}

function formatConversationAction(stage: string): string {
  const actions: Record<string, string> = {
    INITIAL_OUTREACH: 'Started outreach to',
    AWAITING_RESPONSE: 'Awaiting response from',
    IN_CONVERSATION: 'In conversation with',
    ASSESSMENT_SENT: 'Sent assessment to',
    SCHEDULING: 'Scheduling call with',
    SCHEDULED: 'Call scheduled with',
  };
  return actions[stage] || `Conversation: ${stage}`;
}

export default router;
