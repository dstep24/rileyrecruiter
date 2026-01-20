/**
 * Demo Mode API Routes
 *
 * Provides realistic simulated data for demo/testing without
 * requiring real integrations or API keys.
 */

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { buildBooleanQueryForApi, AISearchStrategy } from '../../domain/services/AIQueryGenerator.js';

const router = Router();

// =============================================================================
// DEMO DATA GENERATORS
// =============================================================================

const firstNames = ['Sarah', 'Michael', 'Emily', 'James', 'Jessica', 'David', 'Ashley', 'Chris', 'Amanda', 'Ryan'];
const lastNames = ['Chen', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
const companies = ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Netflix', 'Stripe', 'Airbnb', 'Uber', 'Spotify'];
const titles = ['Senior Software Engineer', 'Staff Engineer', 'Engineering Manager', 'Tech Lead', 'Principal Engineer'];
const skills = ['TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Kubernetes', 'AWS', 'PostgreSQL', 'GraphQL', 'Rust'];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCandidate(index: number) {
  const firstName = randomFrom(firstNames);
  const lastName = randomFrom(lastNames);
  const company = randomFrom(companies);
  const title = randomFrom(titles);
  const candidateSkills = Array.from({ length: randomNumber(3, 6) }, () => randomFrom(skills));

  return {
    id: uuid(),
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@email.com`,
    phone: `+1 (555) ${randomNumber(100, 999)}-${randomNumber(1000, 9999)}`,
    linkedInUrl: `https://linkedin.com/in/${firstName.toLowerCase()}${lastName.toLowerCase()}`,
    currentTitle: title,
    currentCompany: company,
    stage: ['SOURCED', 'CONTACTED', 'RESPONDED', 'SCREENING', 'INTERVIEW_SCHEDULED'][randomNumber(0, 4)],
    status: 'ACTIVE',
    overallScore: randomNumber(60, 95) / 100,
    skills: candidateSkills,
    yearsExperience: randomNumber(3, 15),
    location: ['San Francisco, CA', 'New York, NY', 'Seattle, WA', 'Austin, TX', 'Remote'][randomNumber(0, 4)],
    createdAt: new Date(Date.now() - randomNumber(1, 30) * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function generateTask(index: number, candidates: ReturnType<typeof generateCandidate>[]) {
  const types = ['SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SEND_FOLLOW_UP', 'SCREEN_RESUME', 'SCHEDULE_INTERVIEW'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const statuses = ['PENDING_APPROVAL', 'PENDING_APPROVAL', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'REJECTED'];
  const type = randomFrom(types);
  const candidate = candidates[index % candidates.length];

  const messageTemplates: Record<string, string> = {
    SEND_EMAIL: `Hi ${candidate.firstName},

I came across your profile and was impressed by your experience at ${candidate.currentCompany} as a ${candidate.currentTitle}.

We're building something exciting at TechCorp and looking for talented engineers like yourself. Your background in ${candidate.skills.slice(0, 2).join(' and ')} caught my attention.

Would you be open to a quick chat this week to learn more?

Best,
Riley`,
    SEND_LINKEDIN_MESSAGE: `Hi ${candidate.firstName}, your ${candidate.currentTitle} experience at ${candidate.currentCompany} is impressive! We have an exciting opportunity that might interest you. Open to connecting?`,
    SEND_FOLLOW_UP: `Hi ${candidate.firstName}, just wanted to follow up on my previous message. I'd love to tell you more about what we're building. Would a 15-minute call work this week?`,
    SCREEN_RESUME: `Resume screening for ${candidate.firstName} ${candidate.lastName}`,
    SCHEDULE_INTERVIEW: `Schedule interview with ${candidate.firstName} ${candidate.lastName}`,
  };

  const escalationReasons = [null, null, null, 'FIRST_CONTACT_VIP', 'SENSITIVE_COMMUNICATION', 'LOW_CONFIDENCE'];

  return {
    id: uuid(),
    tenantId: 'demo-tenant',
    type,
    status: randomFrom(statuses),
    priority: randomFrom(priorities),
    payload: {
      candidateId: candidate.id,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      candidateEmail: candidate.email,
      channel: type.includes('LINKEDIN') ? 'linkedin' : 'email',
      subject: type === 'SEND_EMAIL' ? `${candidate.currentTitle} opportunity at TechCorp` : undefined,
      content: messageTemplates[type],
      score: type === 'SCREEN_RESUME' ? randomNumber(65, 95) / 100 : undefined,
    },
    escalationReason: randomFrom(escalationReasons),
    innerLoopId: uuid(),
    iterations: randomNumber(1, 3),
    converged: true,
    effectful: ['SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SEND_FOLLOW_UP'].includes(type),
    createdAt: new Date(Date.now() - randomNumber(0, 48) * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /demo/seed - Generate demo data
 */
router.get('/seed', async (req, res) => {
  const candidateCount = parseInt(req.query.candidates as string) || 25;
  const taskCount = parseInt(req.query.tasks as string) || 15;

  const candidates = Array.from({ length: candidateCount }, (_, i) => generateCandidate(i));
  const tasks = Array.from({ length: taskCount }, (_, i) => generateTask(i, candidates));

  res.json({
    status: 'success',
    data: {
      candidates,
      tasks,
      tenant: {
        id: 'demo-tenant',
        name: 'TechCorp Demo',
        slug: 'techcorp-demo',
        status: 'SUPERVISED',
        config: {},
        createdAt: new Date().toISOString(),
      },
    },
  });
});

/**
 * GET /demo/tasks - Get demo tasks
 */
router.get('/tasks', async (req, res) => {
  const candidates = Array.from({ length: 25 }, (_, i) => generateCandidate(i));
  const tasks = Array.from({ length: 15 }, (_, i) => generateTask(i, candidates));

  // Filter for pending only if requested
  const status = req.query.status as string;
  const filtered = status
    ? tasks.filter((t) => t.status === status)
    : tasks;

  res.json(filtered);
});

/**
 * GET /demo/candidates - Get demo candidates
 */
router.get('/candidates', async (req, res) => {
  const count = parseInt(req.query.count as string) || 25;
  const candidates = Array.from({ length: count }, (_, i) => generateCandidate(i));

  res.json(candidates);
});

/**
 * GET /demo/analytics - Get demo analytics
 */
router.get('/analytics', async (req, res) => {
  const period = req.query.period || 'week';

  res.json({
    period,
    tasks: {
      total: randomNumber(80, 120),
      approved: randomNumber(60, 90),
      rejected: randomNumber(5, 15),
      pending: randomNumber(10, 25),
    },
    candidates: {
      sourced: randomNumber(150, 250),
      contacted: randomNumber(80, 120),
      responded: randomNumber(15, 35),
      screened: randomNumber(20, 40),
      interviewed: randomNumber(8, 15),
    },
    metrics: {
      responseRate: randomNumber(12, 22) / 100,
      approvalRate: randomNumber(85, 95) / 100,
      avgApprovalTime: randomNumber(10, 30),
      avgTimeToResponse: randomNumber(24, 72),
    },
    trends: {
      responsesThisWeek: Array.from({ length: 7 }, () => randomNumber(2, 8)),
      tasksThisWeek: Array.from({ length: 7 }, () => randomNumber(10, 20)),
    },
  });
});

/**
 * GET /demo/guidelines - Get demo guidelines
 */
router.get('/guidelines', async (req, res) => {
  res.json({
    id: uuid(),
    tenantId: 'demo-tenant',
    version: 3,
    status: 'ACTIVE',
    workflows: [
      {
        id: uuid(),
        name: 'Candidate Sourcing',
        description: 'Find and import potential candidates',
        stages: ['Define Search', 'Execute Search', 'Initial Screen', 'Queue for Outreach'],
      },
      {
        id: uuid(),
        name: 'Candidate Outreach',
        description: 'Initial contact and follow-up sequence',
        stages: ['Prepare Message', 'Send Initial', 'Wait for Response', 'Follow Up'],
      },
    ],
    templates: [
      {
        id: uuid(),
        name: 'Initial Outreach - Email',
        channel: 'email',
        purpose: 'initial_outreach',
        subject: '{{role_title}} opportunity at {{company_name}}',
        tone: 'professional',
      },
      {
        id: uuid(),
        name: 'Follow Up - Email',
        channel: 'email',
        purpose: 'follow_up',
        tone: 'friendly',
      },
    ],
    constraints: [
      { id: uuid(), name: 'Email Rate Limit', type: 'rate_limit', config: { emails_per_day: 200 } },
      { id: uuid(), name: 'LinkedIn Rate Limit', type: 'rate_limit', config: { messages_per_day: 150 } },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

/**
 * GET /demo/criteria - Get demo criteria
 */
router.get('/criteria', async (req, res) => {
  res.json({
    id: uuid(),
    tenantId: 'demo-tenant',
    version: 2,
    status: 'ACTIVE',
    qualityStandards: [
      {
        id: uuid(),
        name: 'Message Quality',
        description: 'Standards for outreach messages',
        threshold: 0.8,
        dimensions: ['personalization', 'clarity', 'tone', 'grammar'],
      },
      {
        id: uuid(),
        name: 'Screening Quality',
        description: 'Standards for candidate evaluation',
        threshold: 0.8,
        dimensions: ['completeness', 'accuracy', 'consistency'],
      },
    ],
    evaluationRubrics: [
      {
        id: uuid(),
        name: 'Resume Evaluation',
        taskType: 'screen_resume',
        dimensions: ['experience_match', 'skills_match', 'education_match'],
      },
    ],
    successMetrics: {
      responseRate: { target: 0.15, warning: 0.08, critical: 0.03 },
      qualifiedRate: { target: 0.4, warning: 0.25, critical: 0.1 },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

/**
 * GET /demo/guidelines/versions - Get demo guidelines version history
 */
router.get('/guidelines/versions', async (req, res) => {
  res.json([
    {
      id: 'gv-12',
      version: 12,
      status: 'DRAFT',
      createdBy: 'AGENT',
      changelog: 'Updated initial outreach template with more personalization hooks',
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 'gv-11',
      version: 11,
      status: 'ACTIVE',
      createdBy: 'TELEOPERATOR',
      changelog: 'Refined screening criteria scoring weights',
      createdAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    },
    {
      id: 'gv-10',
      version: 10,
      status: 'REJECTED',
      createdBy: 'AGENT',
      changelog: 'Proposed follow-up timing changes (rejected: too aggressive)',
      createdAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    },
    {
      id: 'gv-9',
      version: 9,
      status: 'ARCHIVED',
      createdBy: 'TELEOPERATOR',
      changelog: 'Initial brand voice calibration',
      createdAt: new Date(Date.now() - 168 * 3600000).toISOString(),
    },
  ]);
});

/**
 * GET /demo/criteria/versions - Get demo criteria version history
 */
router.get('/criteria/versions', async (req, res) => {
  res.json([
    {
      id: 'cv-5',
      version: 5,
      status: 'ACTIVE',
      createdBy: 'TELEOPERATOR',
      changelog: 'Adjusted quality thresholds based on calibration feedback',
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
    {
      id: 'cv-4',
      version: 4,
      status: 'ARCHIVED',
      createdBy: 'TELEOPERATOR',
      changelog: 'Added new failure patterns for outreach',
      createdAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    },
    {
      id: 'cv-3',
      version: 3,
      status: 'ARCHIVED',
      createdBy: 'TELEOPERATOR',
      changelog: 'Updated screening rubric weights',
      createdAt: new Date(Date.now() - 144 * 3600000).toISOString(),
    },
  ]);
});

/**
 * GET /demo/team - Get demo team members
 */
router.get('/team', async (req, res) => {
  res.json([
    {
      id: '1',
      name: 'Sarah Chen',
      email: 'sarah@company.com',
      role: 'admin',
      status: 'active',
      lastActive: new Date(Date.now() - 2 * 60000).toISOString(),
      approvals: 342,
      avgResponseTime: '12 min',
    },
    {
      id: '2',
      name: 'Marcus Johnson',
      email: 'marcus@company.com',
      role: 'teleoperator',
      status: 'active',
      lastActive: new Date(Date.now() - 15 * 60000).toISOString(),
      approvals: 187,
      avgResponseTime: '18 min',
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      email: 'emily@company.com',
      role: 'teleoperator',
      status: 'active',
      lastActive: new Date(Date.now() - 60 * 60000).toISOString(),
      approvals: 156,
      avgResponseTime: '22 min',
    },
    {
      id: '4',
      name: 'David Kim',
      email: 'david@company.com',
      role: 'viewer',
      status: 'invited',
      approvals: 0,
      avgResponseTime: '-',
    },
  ]);
});

/**
 * GET /demo/settings - Get demo settings
 */
router.get('/settings', async (req, res) => {
  res.json({
    general: {
      tenantName: 'TechCorp Demo',
      timezone: 'America/Los_Angeles',
      workingHours: { start: '09:00', end: '17:00' },
      weekendsEnabled: false,
    },
    notifications: {
      emailAlerts: true,
      slackAlerts: true,
      urgentOnly: false,
      digestFrequency: 'daily',
    },
    autonomy: {
      level: 'SUPERVISED',
      approvalRequired: ['SEND_EMAIL', 'SEND_LINKEDIN_MESSAGE', 'SCHEDULE_INTERVIEW'],
      autoApprove: ['FOLLOW_UP_REMINDER'],
    },
    integrations: {
      ats: { connected: true, provider: 'greenhouse', lastSync: new Date().toISOString() },
      email: { connected: true, provider: 'gmail' },
      calendar: { connected: true, provider: 'google' },
      linkedin: { connected: false },
    },
  });
});

/**
 * POST /demo/approve/:taskId - Simulate task approval
 */
router.post('/approve/:taskId', async (req, res) => {
  res.json({
    id: req.params.taskId,
    status: 'APPROVED',
    approvedBy: 'demo-user',
    approvedAt: new Date().toISOString(),
    message: 'Task approved successfully',
  });
});

/**
 * POST /demo/reject/:taskId - Simulate task rejection
 */
router.post('/reject/:taskId', async (req, res) => {
  res.json({
    id: req.params.taskId,
    status: 'REJECTED',
    rejectedBy: 'demo-user',
    rejectedAt: new Date().toISOString(),
    reason: req.body.reason || 'Rejected in demo mode',
    message: 'Task rejected successfully',
  });
});

/**
 * POST /demo/trigger/sourcing - Simulate sourcing
 */
router.post('/trigger/sourcing', async (req, res) => {
  res.json({
    runId: uuid(),
    status: 'started',
    message: 'Demo sourcing started - will generate mock candidates',
    estimatedCandidates: randomNumber(15, 30),
  });
});

/**
 * POST /demo/trigger/outreach - Simulate outreach
 */
router.post('/trigger/outreach', async (req, res) => {
  const count = req.body.candidateIds?.length || 5;
  res.json({
    runId: uuid(),
    status: 'started',
    message: `Demo outreach started - ${count} messages will be drafted`,
    tasksCreated: count,
  });
});

// =============================================================================
// SOURCING DEMO ENDPOINTS
// =============================================================================

/**
 * GET /demo/requisitions - Get demo job requisitions
 */
router.get('/requisitions', async (req, res) => {
  res.json([
    {
      id: 'req-1',
      title: 'Senior Software Engineer',
      description:
        'Looking for an experienced software engineer to join our platform team. You will work on building scalable distributed systems, mentor junior engineers, and drive technical decisions.',
      location: 'San Francisco, CA',
      status: 'OPEN',
      requirements: ['5+ years of experience', 'Strong Python or Go skills', 'Experience with distributed systems'],
    },
    {
      id: 'req-2',
      title: 'Product Manager',
      description:
        'Seeking a product manager to lead our growth initiatives. You will define product strategy, work closely with engineering, and drive user acquisition.',
      location: 'Remote',
      status: 'OPEN',
      requirements: ['3+ years in product management', 'Data-driven mindset', 'Startup experience preferred'],
    },
    {
      id: 'req-3',
      title: 'Data Scientist',
      description:
        'Join our ML team to build predictive models and recommendation systems. You will work with large datasets and deploy models to production.',
      location: 'New York, NY',
      status: 'OPEN',
      requirements: ['PhD or MS in relevant field', 'Experience with PyTorch or TensorFlow', 'Production ML experience'],
    },
    {
      id: 'req-4',
      title: 'DevOps Engineer',
      description:
        'We need a DevOps engineer to scale our infrastructure. You will manage Kubernetes clusters, CI/CD pipelines, and monitoring systems.',
      location: 'Seattle, WA',
      status: 'OPEN',
      requirements: ['Kubernetes expertise', 'AWS or GCP experience', 'Infrastructure as Code'],
    },
  ]);
});

/**
 * POST /demo/sourcing/parse-jd - Parse job description
 */
router.post('/sourcing/parse-jd', async (req, res) => {
  const { title, description, requirements, location } = req.body;

  // Simulate AI parsing
  const parsedTitles = [title];
  if (title.toLowerCase().includes('engineer')) {
    parsedTitles.push('Developer', 'Programmer');
  }
  if (title.toLowerCase().includes('senior')) {
    parsedTitles.push(title.replace(/senior/i, 'Staff'), title.replace(/senior/i, 'Lead'));
  }

  const extractedSkills: string[] = [];
  const skillKeywords = ['python', 'javascript', 'typescript', 'react', 'node', 'go', 'rust', 'java', 'kubernetes', 'aws', 'gcp', 'docker', 'sql', 'graphql', 'machine learning', 'ml', 'ai'];

  const fullText = `${description} ${(requirements || []).join(' ')}`.toLowerCase();
  for (const skill of skillKeywords) {
    if (fullText.includes(skill)) {
      extractedSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  if (extractedSkills.length === 0) {
    extractedSkills.push('Python', 'JavaScript', 'SQL');
  }

  const booleanQuery = `("${parsedTitles[0]}"${parsedTitles.length > 1 ? ` OR "${parsedTitles[1]}"` : ''}) AND (${extractedSkills.slice(0, 3).join(' OR ')}) NOT recruiter`;

  res.json({
    success: true,
    criteria: {
      titles: parsedTitles,
      alternativeTitles: [],
      keywords: extractedSkills,
      requiredSkills: extractedSkills.slice(0, 5),
      preferredSkills: extractedSkills.slice(5),
      technicalKeywords: extractedSkills,
      experienceYears: { min: 3, max: 10 },
      seniorityLevel: title.toLowerCase().includes('senior') ? 'senior' : 'mid',
      locations: location ? [location] : ['San Francisco, CA'],
      remoteOk: location?.toLowerCase().includes('remote') || false,
      industries: ['Technology', 'Software'],
      targetCompanies: ['Google', 'Meta', 'Amazon', 'Microsoft', 'Stripe', 'Airbnb'],
      excludeCompanies: [],
      booleanQuery,
      searchKeywords: `${title} ${extractedSkills.slice(0, 3).join(' ')}`,
      recommendedApi: 'sales_navigator',
      confidence: 0.85,
      notes: ['Parsed from job description', 'Skills extracted from requirements'],
    },
  });
});

// In-memory storage for demo search runs
const demoSearchRuns = new Map<
  string,
  {
    id: string;
    status: string;
    progress: number;
    totalFound: number;
    candidates: Array<{
      id: string;
      name: string;
      headline: string;
      currentTitle: string;
      currentCompany: string;
      location: string;
      profileUrl: string;
      relevanceScore: number;
      fitScore: number;
      status: string;
    }>;
    criteria?: object;
    startedAt: Date;
    completedAt?: Date;
  }
>();

/**
 * POST /demo/sourcing/search - Start a demo LinkedIn search
 */
router.post('/sourcing/search', async (req, res) => {
  const { requisitionId, maxResults = 50, customCriteria } = req.body;
  const runId = uuid();

  // Create initial run
  demoSearchRuns.set(runId, {
    id: runId,
    status: 'running',
    progress: 0,
    totalFound: 0,
    candidates: [],
    startedAt: new Date(),
  });

  // Simulate async search with progress updates
  setTimeout(() => {
    const run = demoSearchRuns.get(runId);
    if (run) {
      run.progress = 30;
      run.totalFound = 4;
    }
  }, 500);

  setTimeout(() => {
    const run = demoSearchRuns.get(runId);
    if (run) {
      run.progress = 60;
      run.totalFound = 8;
    }
  }, 1000);

  setTimeout(() => {
    const run = demoSearchRuns.get(runId);
    if (run) {
      run.progress = 100;
      run.status = 'completed';
      run.completedAt = new Date();

      // Generate mock candidates
      const candidateCount = Math.min(maxResults, 12);
      const mockCandidates = [];

      const candidateNames = [
        'Sarah Chen',
        'Michael Rodriguez',
        'Emily Johnson',
        'David Kim',
        'Jessica Martinez',
        'James Wilson',
        'Amanda Taylor',
        'Christopher Lee',
        'Lauren Brown',
        'Andrew Garcia',
        'Megan Thompson',
        'Daniel White',
      ];

      const mockCompanies = [
        'Google',
        'Meta',
        'Amazon',
        'Microsoft',
        'Stripe',
        'Airbnb',
        'Uber',
        'Netflix',
        'Salesforce',
        'Dropbox',
        'Slack',
        'Figma',
      ];

      const candidateTitles = customCriteria?.titles || ['Software Engineer'];
      const candidateSkills = customCriteria?.skills?.slice(0, 3).join(', ') || 'Python, JavaScript';
      const candidateLocation = customCriteria?.locations?.[0] || 'San Francisco, CA';

      for (let i = 0; i < candidateCount; i++) {
        const name = candidateNames[i];
        const company = mockCompanies[i];
        const title = candidateTitles[i % candidateTitles.length];

        mockCandidates.push({
          id: uuid(),
          name,
          headline: `${title} at ${company} | ${candidateSkills}`,
          currentTitle: title,
          currentCompany: company,
          location: candidateLocation,
          profileUrl: `https://linkedin.com/in/${name.toLowerCase().replace(' ', '-')}`,
          relevanceScore: Math.floor(95 - i * 3 + Math.random() * 5),
          fitScore: Math.floor(90 - i * 2 + Math.random() * 8),
          status: 'new',
        });
      }

      run.candidates = mockCandidates;
      run.totalFound = mockCandidates.length;
    }
  }, 2000);

  res.json({
    runId,
    status: 'queued',
    message: `Demo LinkedIn search started for requisition ${requisitionId}`,
  });
});

/**
 * GET /demo/sourcing/results/:runId - Get demo search results
 */
router.get('/sourcing/results/:runId', async (req, res) => {
  const { runId } = req.params;
  const run = demoSearchRuns.get(runId);

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
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  });
});

// =============================================================================
// AI SCORING ENDPOINTS
// =============================================================================

/**
 * POST /demo/ai/score-candidates - Score candidates using AI
 *
 * This endpoint calls the real AI scoring service when Anthropic API is configured,
 * otherwise returns realistic mock scores.
 */
router.post('/ai/score-candidates', async (req, res) => {
  const { candidates, requirements, searchStrategy } = req.body;

  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'candidates array is required' });
  }

  if (!requirements || !requirements.title) {
    return res.status(400).json({ error: 'requirements with title is required' });
  }

  // Check for Anthropic API key - first from request header, then from environment
  const headerApiKey = req.headers['x-anthropic-api-key'] as string;
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicApiKey = headerApiKey || envApiKey;
  const hasAnthropicKey = !!anthropicApiKey;

  // Temporarily set the API key for this request if provided via header
  if (headerApiKey && !envApiKey) {
    process.env.ANTHROPIC_API_KEY = headerApiKey;
  }

  if (hasAnthropicKey) {
    try {
      // Use real AI scoring
      const { AICandidateScorer, unipileProfileToCandidateProfile, deriveRoleRequirements } = await import(
        '../../domain/services/AICandidateScorer.js'
      );

      const scorer = new AICandidateScorer();

      // Convert candidates to proper format
      const candidateProfiles = candidates.map((c: Record<string, unknown>) =>
        unipileProfileToCandidateProfile({
          id: c.id as string,
          provider_id: c.providerId as string,
          first_name: (c.name as string)?.split(' ')[0],
          last_name: (c.name as string)?.split(' ').slice(1).join(' '),
          headline: c.headline as string,
          location: c.location as string,
          experiences: [
            {
              title: c.currentTitle as string,
              company_name: c.currentCompany as string,
              duration: '2 years',
            },
          ],
          skills: (c.skills as string[]) || [],
        })
      );

      // Derive role requirements
      const roleRequirements = deriveRoleRequirements(
        {
          titles: [requirements.title],
          requiredSkills: requirements.requiredSkills || [],
          preferredSkills: requirements.preferredSkills || [],
          locations: requirements.location ? [requirements.location] : [],
        },
        requirements.title,
        requirements.description
      );

      // Score candidates
      const result = await scorer.scoreCandidates(candidateProfiles, roleRequirements, {
        batchSize: 3,
        minScore: 0,
      });

      // Clean up temporary API key
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }

      return res.json({
        success: true,
        aiPowered: true,
        scores: result.scores,
        summary: result.summary,
      });
    } catch (error) {
      // Clean up temporary API key on error
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }
      console.error('AI scoring error:', error);
      // Fall through to mock scoring
    }
  }

  // Mock AI scoring for demo mode - uses searchStrategy for intelligent scoring
  const mockScores = candidates.map(
    (
      candidate: {
        id: string;
        name?: string;
        currentTitle?: string;
        currentCompany?: string;
        location?: string;
        headline?: string;
      },
      index: number
    ) => {
      const titleLower = (candidate.currentTitle || candidate.headline || '').toLowerCase();
      const headlineLower = (candidate.headline || '').toLowerCase();
      const fullText = `${titleLower} ${headlineLower}`;

      // ============================================================================
      // SENIORITY MATCHING - Based on searchStrategy.seniorityLevel
      // ============================================================================
      let seniorityScore = 50; // Default

      // Use search strategy seniority if available
      const targetSeniority = searchStrategy?.seniorityLevel?.toLowerCase() || 'ic';

      // Map seniority levels to expected title keywords
      const seniorityKeywordMap: Record<string, string[]> = {
        'c-level': ['ceo', 'cto', 'cfo', 'coo', 'cio', 'ciso', 'chief', 'founder', 'co-founder'],
        'vp': ['vp', 'vice president', 'svp', 'evp', 'gvp'],
        'director': ['director', 'head of', 'senior director', 'group director'],
        'senior manager': ['senior manager', 'sr manager', 'group manager', 'senior engineering manager'],
        'manager': ['manager', 'engineering manager', 'team manager', 'development manager'],
        'lead': ['lead', 'principal', 'staff', 'tech lead', 'team lead', 'architect'],
        'senior': ['senior', 'sr.', 'sr ', 'senior software', 'senior engineer'],
        'ic': ['engineer', 'developer', 'programmer', 'analyst'],
      };

      const targetKeywords = seniorityKeywordMap[targetSeniority] || [];
      const matchesSeniority = targetKeywords.some(kw => fullText.includes(kw));

      // Check for red flags from search strategy
      const redFlags = searchStrategy?.redFlags || ['intern', 'junior', 'entry-level', 'student', 'graduate'];
      const hasRedFlag = redFlags.some((flag: string) => fullText.includes(flag.toLowerCase()));

      if (hasRedFlag) {
        seniorityScore = randomNumber(10, 30);
      } else if (matchesSeniority) {
        seniorityScore = randomNumber(75, 95);
      } else {
        // Check if they're at an adjacent level (one above or below)
        const seniorityLevels = ['ic', 'senior', 'lead', 'manager', 'senior manager', 'director', 'vp', 'c-level'];
        const targetIdx = seniorityLevels.indexOf(targetSeniority);
        const hasAdjacentLevel = targetIdx > 0 && seniorityKeywordMap[seniorityLevels[targetIdx - 1]]?.some(kw => fullText.includes(kw));
        const hasHigherLevel = targetIdx < seniorityLevels.length - 1 && seniorityKeywordMap[seniorityLevels[targetIdx + 1]]?.some(kw => fullText.includes(kw));

        if (hasAdjacentLevel) {
          seniorityScore = randomNumber(40, 60); // Too junior
        } else if (hasHigherLevel) {
          seniorityScore = randomNumber(70, 85); // More senior (could be good)
        } else {
          seniorityScore = randomNumber(50, 70);
        }
      }

      // ============================================================================
      // TITLE MATCHING - Based on searchStrategy.primaryTitles and titleVariants
      // ============================================================================
      let titleScore = 50;

      const primaryTitles = searchStrategy?.primaryTitles || [requirements.title];
      const titleVariants = searchStrategy?.titleVariants || [];
      const excludeTitles = searchStrategy?.excludeTitles || [];
      const allAcceptableTitles = [...primaryTitles, ...titleVariants].map((t: string) => t.toLowerCase());

      // Check for excluded titles first
      const hasExcludedTitle = excludeTitles.some((t: string) => fullText.includes(t.toLowerCase()));
      if (hasExcludedTitle) {
        titleScore = randomNumber(15, 35);
      } else {
        // Check for primary title match
        const matchesPrimary = primaryTitles.some((t: string) => fullText.includes(t.toLowerCase()));
        const matchesVariant = titleVariants.some((t: string) => fullText.includes(t.toLowerCase()));

        if (matchesPrimary) {
          titleScore = randomNumber(85, 98);
        } else if (matchesVariant) {
          titleScore = randomNumber(70, 88);
        } else {
          // Partial match - check for key words
          const titleWords = allAcceptableTitles.flatMap((t: string) => t.split(/\s+/).filter((w: string) => w.length > 3));
          const partialMatch = titleWords.some((word: string) => fullText.includes(word));
          titleScore = partialMatch ? randomNumber(50, 70) : randomNumber(30, 50);
        }
      }

      // ============================================================================
      // SKILLS MATCHING - Based on searchStrategy.mustHaveSkills and niceToHaveSkills
      // ============================================================================
      let technicalScore = 60;

      const mustHaveSkills = searchStrategy?.mustHaveSkills || requirements.requiredSkills || [];
      const niceToHaveSkills = searchStrategy?.niceToHaveSkills || requirements.preferredSkills || [];

      // Check how many must-have skills appear in headline
      const mustHaveMatches = mustHaveSkills.filter((skill: string) =>
        headlineLower.includes(skill.toLowerCase())
      ).length;

      const niceToHaveMatches = niceToHaveSkills.filter((skill: string) =>
        headlineLower.includes(skill.toLowerCase())
      ).length;

      if (mustHaveSkills.length > 0) {
        const mustHaveRatio = mustHaveMatches / mustHaveSkills.length;
        technicalScore = Math.round(50 + (mustHaveRatio * 40) + (niceToHaveMatches * 3));
      } else {
        technicalScore = randomNumber(60, 80);
      }
      technicalScore = Math.min(98, Math.max(20, technicalScore + randomNumber(-5, 5)));

      // ============================================================================
      // LEADERSHIP SIGNALS - Based on searchStrategy.leadershipIndicators
      // ============================================================================
      let leadershipScore = 50;

      const leadershipIndicators = searchStrategy?.leadershipIndicators || ['led', 'managed', 'built', 'scaled', 'grew'];

      const leadershipMatches = leadershipIndicators.filter((indicator: string) =>
        headlineLower.includes(indicator.toLowerCase())
      ).length;

      if (targetSeniority === 'ic' || targetSeniority === 'senior') {
        // Leadership not required for IC roles
        leadershipScore = randomNumber(40, 70);
      } else if (leadershipMatches > 0) {
        leadershipScore = Math.min(95, 60 + (leadershipMatches * 12) + randomNumber(0, 10));
      } else {
        // Leadership expected but not found
        leadershipScore = randomNumber(25, 50);
      }

      // ============================================================================
      // LOCATION MATCHING
      // ============================================================================
      const candidateCity = (candidate.location || '').split(',')[0].toLowerCase().trim();
      const reqCity = (requirements.location || '').split(',')[0].toLowerCase().trim();
      const locationMatch = reqCity && candidateCity && (candidateCity.includes(reqCity) || reqCity.includes(candidateCity));
      const locationScore = locationMatch ? randomNumber(80, 100) : randomNumber(30, 60);

      // ============================================================================
      // COMPANY QUALITY BONUS
      // ============================================================================
      const topCompanies = ['Google', 'Meta', 'Amazon', 'Microsoft', 'Apple', 'Netflix', 'Stripe', 'Airbnb', 'Uber', 'Salesforce', 'Intel', 'NVIDIA', 'Adobe', 'LinkedIn', 'Twitter', 'X', 'Oracle', 'IBM', 'Cisco'];
      const isTopCompany = topCompanies.some(tc => (candidate.currentCompany || '').toLowerCase().includes(tc.toLowerCase()));
      const companyBonus = isTopCompany ? 10 : 0;

      // ============================================================================
      // CAREER TRAJECTORY - Based on title progression signals
      // ============================================================================
      const trajectoryScore = matchesSeniority ? randomNumber(70, 90) : randomNumber(40, 70);

      // ============================================================================
      // OVERALL SCORE CALCULATION
      // ============================================================================
      // Weight the scores based on what matters for the role
      const weights = {
        seniority: 0.30,
        title: 0.25,
        technical: 0.20,
        leadership: targetSeniority === 'ic' ? 0.05 : 0.15,
        trajectory: 0.10,
        location: 0.10 - (targetSeniority === 'ic' ? 0 : 0.05),
      };

      const weightedScore =
        (seniorityScore * weights.seniority) +
        (titleScore * weights.title) +
        (technicalScore * weights.technical) +
        (leadershipScore * weights.leadership) +
        (trajectoryScore * weights.trajectory) +
        (locationScore * weights.location) +
        companyBonus;

      const overallScore = Math.min(98, Math.max(15, Math.round(weightedScore)));

      // ============================================================================
      // RECOMMENDATION
      // ============================================================================
      let recommendation: 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO' | 'STRONG_NO';
      if (overallScore >= 85) recommendation = 'STRONG_YES';
      else if (overallScore >= 70) recommendation = 'YES';
      else if (overallScore >= 55) recommendation = 'MAYBE';
      else if (overallScore >= 40) recommendation = 'NO';
      else recommendation = 'STRONG_NO';

      // ============================================================================
      // HIGHLIGHTS AND CONCERNS
      // ============================================================================
      const highlights: string[] = [];
      const concerns: string[] = [];

      // Highlights
      if (matchesSeniority) {
        highlights.push(`Matches ${searchStrategy?.seniorityLevel || 'target'} seniority level`);
      }
      if (titleScore >= 70) {
        highlights.push(`Title aligns with ${primaryTitles[0] || requirements.title}`);
      }
      if (isTopCompany) {
        highlights.push(`Strong company background (${candidate.currentCompany})`);
      }
      if (mustHaveMatches > 0) {
        highlights.push(`Has ${mustHaveMatches}/${mustHaveSkills.length} must-have skills`);
      }
      if (leadershipMatches > 0 && targetSeniority !== 'ic') {
        highlights.push('Shows leadership experience');
      }
      if (locationMatch) {
        highlights.push(`Located in ${requirements.location}`);
      }

      // Concerns
      if (hasRedFlag) {
        concerns.push(`Profile indicates junior level (${redFlags.find((f: string) => fullText.includes(f.toLowerCase()))})`);
      }
      if (hasExcludedTitle) {
        concerns.push(`Title suggests different role level`);
      }
      if (seniorityScore < 50 && !hasRedFlag) {
        concerns.push(`May not meet ${searchStrategy?.seniorityLevel || 'required'} seniority requirements`);
      }
      if (mustHaveSkills.length > 0 && mustHaveMatches === 0) {
        concerns.push('No visible must-have skills in profile');
      }
      if (leadershipScore < 40 && targetSeniority !== 'ic' && targetSeniority !== 'senior') {
        concerns.push('Limited leadership evidence for this level');
      }
      if (!locationMatch && requirements.location) {
        concerns.push(`Located in ${candidate.location || 'unknown'}, role is in ${requirements.location}`);
      }

      return {
        candidateId: candidate.id,
        overallScore,
        dimensions: {
          seniorityMatch: {
            score: Math.round(seniorityScore),
            weight: weights.seniority,
            reasoning: searchStrategy?.levelRationale || `${searchStrategy?.seniorityLevel || 'target'} level position`,
            evidence: [candidate.currentTitle || 'Unknown title'],
          },
          technicalFit: {
            score: Math.round(technicalScore),
            weight: weights.technical,
            reasoning: `Skills alignment: ${mustHaveMatches}/${mustHaveSkills.length} must-have skills found`,
            evidence: mustHaveSkills.filter((s: string) => headlineLower.includes(s.toLowerCase())),
          },
          careerTrajectory: {
            score: Math.round(trajectoryScore),
            weight: weights.trajectory,
            reasoning: matchesSeniority ? 'Career level matches target' : 'Career progression under review',
            evidence: [candidate.currentCompany || 'Unknown company'],
          },
          leadershipEvidence: {
            score: Math.round(leadershipScore),
            weight: weights.leadership,
            reasoning: targetSeniority === 'ic' ? 'Leadership not required for this role' : 'Leadership signals assessment',
            evidence: leadershipIndicators.filter((i: string) => headlineLower.includes(i.toLowerCase())),
          },
          locationMatch: {
            score: Math.round(locationScore),
            weight: weights.location,
            reasoning: locationMatch ? 'Location matches requirements' : 'Location mismatch',
            evidence: [candidate.location || 'Unknown'],
          },
        },
        recommendation,
        highlights: highlights.length > 0 ? highlights : ['Profile under review'],
        concerns: concerns.length > 0 ? concerns : [],
        suggestedApproach:
          overallScore >= 70
            ? `Highlight the ${searchStrategy?.seniorityLevel || ''} ${requirements.title} opportunity and growth potential`
            : 'Consider additional screening before outreach',
        metadata: {
          scoredAt: new Date(),
          modelUsed: 'demo-mock-v2',
          latencyMs: randomNumber(100, 500),
          tokensUsed: randomNumber(500, 1500),
        },
      };
    }
  );

  // Calculate summary
  const qualified = mockScores.filter((s) => s.overallScore >= 70).length;
  const borderline = mockScores.filter((s) => s.overallScore >= 50 && s.overallScore < 70).length;
  const unqualified = mockScores.filter((s) => s.overallScore < 50).length;
  const avgScore =
    mockScores.length > 0 ? Math.round(mockScores.reduce((sum, s) => sum + s.overallScore, 0) / mockScores.length) : 0;

  res.json({
    success: true,
    aiPowered: false,
    scores: mockScores,
    summary: {
      totalCandidates: candidates.length,
      qualified,
      borderline,
      unqualified,
      avgScore,
      processingTimeMs: randomNumber(1000, 3000),
      totalTokensUsed: randomNumber(5000, 15000),
    },
  });
});

/**
 * POST /demo/ai/generate-search-strategy - Generate intelligent search strategy from JD
 *
 * This endpoint uses Claude as a "LinkedIn Recruiter Search Expert" to analyze
 * job descriptions and generate optimized search strategies with title variants,
 * seniority understanding, exclusions, and boolean queries.
 */
router.post('/ai/generate-search-strategy', async (req, res) => {
  const { title, description, skills, location, companyContext, intakeNotes, isFullyRemote } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  // Check for Anthropic API key - first from request header, then from environment
  const headerApiKey = req.headers['x-anthropic-api-key'] as string;
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicApiKey = headerApiKey || envApiKey;
  const hasAnthropicKey = !!anthropicApiKey;

  // Temporarily set the API key for this request if provided via header
  if (headerApiKey && !envApiKey) {
    process.env.ANTHROPIC_API_KEY = headerApiKey;
  }

  if (hasAnthropicKey) {
    try {
      // Reset singletons to pick up the new API key
      const { resetClaudeClient } = await import('../../integrations/llm/ClaudeClient.js');
      resetClaudeClient();

      const { AIQueryGenerator, resetAIQueryGenerator, buildBooleanQueryForApi } = await import('../../domain/services/AIQueryGenerator.js');
      resetAIQueryGenerator();

      const generator = new AIQueryGenerator();

      const strategy = await generator.generateSearchStrategy({
        title,
        jobDescription: description || '',
        location: isFullyRemote ? undefined : location, // Skip location for fully remote roles
        requirements: skills || [],
        preferredSkills: [],
        companyContext,
        intakeNotes, // Notes from HM that take precedence over JD
        isFullyRemote,
      });

      // Generate Boolean query using our function that ALWAYS includes must-have skills
      // This is critical: title-only searches return people with wrong tech stack
      const classicQuery = buildBooleanQueryForApi(strategy, 'classic');
      const fullQuery = buildBooleanQueryForApi(strategy, 'sales_navigator');

      console.log('[AI Parse JD] Generated Boolean queries:');
      console.log(`  Classic (${classicQuery.length} chars): ${classicQuery}`);
      console.log(`  Full (${fullQuery.length} chars): ${fullQuery}`);
      console.log(`  Must-have skills included: ${strategy.mustHaveSkills.join(', ')}`);

      // Convert to ParsedCriteria format for the dashboard
      const parsedCriteria = {
        titles: [...strategy.primaryTitles, ...strategy.titleVariants],
        requiredSkills: strategy.mustHaveSkills,
        preferredSkills: strategy.niceToHaveSkills,
        experienceYears: {
          min: strategy.minYearsExperience,
          max: strategy.minYearsExperience + 10,
        },
        locations: location ? [location] : [],
        // Use our generated Boolean query that includes skills, NOT the AI's raw query
        booleanQuery: fullQuery,
        // Also provide the shorter classic query for reference
        booleanQueryClassic: classicQuery,
        searchKeywords: [...strategy.primaryTitles, ...strategy.mustHaveSkills.slice(0, 3)].join(' '),
        confidence: strategy.confidence,
      };

      // Clean up temporary API key
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }

      return res.json({
        success: true,
        aiPowered: true,
        parsedCriteria,
        strategy: {
          seniorityLevel: strategy.seniorityLevel,
          levelRationale: strategy.levelRationale,
          primaryTitles: strategy.primaryTitles,
          titleVariants: strategy.titleVariants,
          excludeTitles: strategy.excludeTitles,
          minYearsExperience: strategy.minYearsExperience,
          minYearsAtLevel: strategy.minYearsAtLevel,
          mustHaveSkills: strategy.mustHaveSkills,
          niceToHaveSkills: strategy.niceToHaveSkills,
          skillWeights: strategy.skillWeights,
          leadershipIndicators: strategy.leadershipIndicators,
          achievementPatterns: strategy.achievementPatterns,
          redFlags: strategy.redFlags,
          searchQueries: strategy.searchQueries,
          reasoning: strategy.reasoning,
          confidence: strategy.confidence,
        },
      });
    } catch (error) {
      // Clean up temporary API key on error
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }
      console.error('AI search strategy generation error:', error);
      // Fall through to mock
    }
  }

  // Mock search strategy for demo mode
  const titleLower = title.toLowerCase();

  // Infer seniority level
  let seniorityLevel = 'IC';
  let minYearsExperience = 3;
  let titleVariants: string[] = [];
  let excludeTitles: string[] = [];

  if (/\b(cto|ceo|cfo|coo|chief)\b/.test(titleLower)) {
    seniorityLevel = 'C-Level';
    minYearsExperience = 15;
    titleVariants = ['Chief Technology Officer', 'Chief Engineering Officer'];
    excludeTitles = ['VP', 'Director', 'Manager'];
  } else if (/\b(vp|vice president)\b/.test(titleLower)) {
    seniorityLevel = 'VP';
    minYearsExperience = 12;
    titleVariants = ['Vice President of Engineering', 'SVP Engineering', 'VP Technology'];
    excludeTitles = ['Director', 'Senior Manager', 'Manager', 'Lead'];
  } else if (/\bdirector\b/.test(titleLower) || /\bhead of\b/.test(titleLower)) {
    seniorityLevel = 'Director';
    minYearsExperience = 10;
    titleVariants = [
      'VP of Engineering',
      'Head of Engineering',
      'Engineering Director',
      'Director of Software Engineering',
      'Director of Software Development',
      'Senior Director of Engineering',
    ];
    excludeTitles = ['Staff Engineer', 'Principal Engineer', 'Senior Engineer', 'Tech Lead', 'Manager'];
  } else if (/\bsenior manager\b/.test(titleLower)) {
    seniorityLevel = 'Senior Manager';
    minYearsExperience = 8;
    titleVariants = ['Engineering Manager II', 'Group Engineering Manager'];
    excludeTitles = ['Manager I', 'Tech Lead', 'Senior Engineer'];
  } else if (/\bmanager\b/.test(titleLower)) {
    seniorityLevel = 'Manager';
    minYearsExperience = 5;
    titleVariants = ['Engineering Manager', 'Software Development Manager', 'Technical Manager'];
    excludeTitles = ['Tech Lead', 'Lead Engineer', 'Staff Engineer'];
  } else if (/\b(lead|principal|staff)\b/.test(titleLower)) {
    seniorityLevel = 'Lead';
    minYearsExperience = 5;
    titleVariants = ['Staff Engineer', 'Principal Engineer', 'Tech Lead', 'Lead Software Engineer'];
    excludeTitles = ['Manager', 'Director'];
  } else {
    titleVariants = ['Software Engineer', 'Developer', 'Programmer'];
    excludeTitles = [];
  }

  const mockStrategy = {
    seniorityLevel,
    levelRationale: `Based on title "${title}", this appears to be a ${seniorityLevel} level position`,
    primaryTitles: [title],
    titleVariants,
    excludeTitles,
    minYearsExperience,
    minYearsAtLevel: Math.max(2, Math.floor(minYearsExperience / 3)),
    mustHaveSkills: skills || ['Software Engineering'],
    niceToHaveSkills: [],
    skillWeights: (skills || []).reduce((acc: Record<string, number>, skill: string) => {
      acc[skill] = 1.0;
      return acc;
    }, {}),
    leadershipIndicators:
      seniorityLevel !== 'IC'
        ? ['Led team of', 'Managed', 'Built and scaled', 'Grew team from']
        : ['Contributed to', 'Developed', 'Implemented'],
    achievementPatterns: ['Launched', 'Delivered', 'Increased', 'Reduced', 'Improved'],
    redFlags: ['Intern', 'Junior', 'Entry-level', 'Student'],
    searchQueries: [
      {
        query: buildBooleanQueryForApi({
          primaryTitles: [title],
          titleVariants: titleVariants,
          excludeTitles: [],
          mustHaveSkills: skills || [],
          niceToHaveSkills: [],
        } as unknown as AISearchStrategy, 'classic'),
        api: 'classic',
        priority: 1,
        rationale: 'Classic API - shorter query with primary titles + key skills (~200 chars)',
        expectedYield: 'high',
      },
      {
        query: buildBooleanQueryForApi({
          primaryTitles: [title],
          titleVariants: titleVariants,
          excludeTitles: ['Sales', 'Marketing', 'HR', 'Recruiting'],
          mustHaveSkills: skills || [],
          niceToHaveSkills: [],
        } as unknown as AISearchStrategy, 'recruiter'),
        api: 'recruiter',
        priority: 2,
        rationale: 'Recruiter API - full query with all variants + skills + exclusions (~1000 chars)',
        expectedYield: 'high',
      },
      {
        query: buildBooleanQueryForApi({
          primaryTitles: [title],
          titleVariants: titleVariants,
          excludeTitles: [],
          mustHaveSkills: skills || [],
          niceToHaveSkills: [],
        } as unknown as AISearchStrategy, 'sales_navigator'),
        api: 'sales_navigator',
        priority: 3,
        rationale: 'Sales Navigator API - medium query with more variants (~500 chars)',
        expectedYield: 'high',
      },
    ],
    reasoning: `Search strategy for ${seniorityLevel} level ${title} role`,
    confidence: 0.75,
  };

  // Generate proper Boolean query with skills using our utility
  // Format: (titles) AND (skills) - ensures we find candidates with the right tech stack
  const mockSkills = skills || ['Software Engineering'];
  const titleSection = titleVariants.length > 0
    ? `("${title}" OR "${titleVariants.slice(0, 2).join('" OR "')}")`
    : `"${title}"`;
  const skillSection = mockSkills.length > 0
    ? `(${mockSkills.slice(0, 4).join(' OR ')})`
    : '';
  const mockBooleanQuery = skillSection
    ? `${titleSection} AND ${skillSection}`
    : titleSection;

  console.log('[Mock Parse JD] Generated Boolean query:', mockBooleanQuery);
  console.log('[Mock Parse JD] Skills included:', mockSkills.slice(0, 4).join(', '));

  const parsedCriteria = {
    titles: [title, ...titleVariants],
    requiredSkills: mockSkills,
    preferredSkills: [],
    experienceYears: {
      min: minYearsExperience,
      max: minYearsExperience + 10,
    },
    locations: location ? [location] : [],
    booleanQuery: mockBooleanQuery,
    searchKeywords: `${title} ${mockSkills.slice(0, 5).join(' ')}`,
    confidence: mockStrategy.confidence,
  };

  res.json({
    success: true,
    aiPowered: false,
    parsedCriteria,
    strategy: mockStrategy,
  });
});

/**
 * POST /demo/ai/sourcing-score - Score candidates using simplified 3-pillar AI scoring
 *
 * This is the NEW simplified scoring endpoint that uses context-aware reasoning:
 * - Role Fit (40%): Are they doing similar work?
 * - Scope Match (40%): Are they at the right level? (considers company context)
 * - Location (20%): Can they work here?
 *
 * Key insight: "CTO at 50-person startup" ≈ Director scope,
 *              "CTO at Fortune 500" = 2-3 levels above Director
 */
router.post('/ai/sourcing-score', async (req, res) => {
  console.log('[AI Sourcing Score] Endpoint hit');
  const { candidates, role, intakeNotes, isFullyRemote } = req.body;

  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'candidates array is required' });
  }

  if (!role || !role.title) {
    return res.status(400).json({ error: 'role with title is required' });
  }

  console.log('[AI Sourcing Score] Validation passed, checking API key');

  // Check for Anthropic API key
  const headerApiKey = req.headers['x-anthropic-api-key'] as string;
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicApiKey = headerApiKey || envApiKey;
  const hasAnthropicKey = !!anthropicApiKey;

  console.log(`[AI Sourcing Score] Has API key: ${hasAnthropicKey}, from header: ${!!headerApiKey}, from env: ${!!envApiKey}`);

  // Temporarily set the API key for this request if provided via header
  if (headerApiKey && !envApiKey) {
    process.env.ANTHROPIC_API_KEY = headerApiKey;
  }

  if (hasAnthropicKey) {
    try {
      console.log('[AI Sourcing Score] Importing ClaudeClient...');
      // Reset singletons to pick up the new API key
      const { resetClaudeClient } = await import('../../integrations/llm/ClaudeClient.js');
      console.log('[AI Sourcing Score] Resetting ClaudeClient...');
      resetClaudeClient();

      console.log('[AI Sourcing Score] Importing AISourcingScorer...');
      const { AISourcingScorer, resetAISourcingScorer } = await import(
        '../../domain/services/AISourcingScorer.js'
      );
      console.log('[AI Sourcing Score] Resetting AISourcingScorer...');
      resetAISourcingScorer();

      console.log('[AI Sourcing Score] Creating scorer instance...');
      const scorer = new AISourcingScorer();

      // Convert candidates to proper format (including full profile data if enriched)
      const candidateInputs = candidates.map((c: Record<string, unknown>) => ({
        id: (c.id as string) || uuid(),
        name: c.name as string || 'Unknown',
        currentTitle: (c.currentTitle as string) || (c.headline as string)?.split(' at ')[0] || 'Unknown',
        currentCompany: (c.currentCompany as string) || (c.headline as string)?.split(' at ')[1]?.split(' |')[0] || 'Unknown',
        headline: c.headline as string,
        location: c.location as string,
        // Include full profile data for comprehensive scoring (About section, work history, skills)
        summary: c.summary as string | undefined,
        experiences: c.experiences as Array<{
          title: string;
          company: string;
          startDate?: string;
          endDate?: string;
          isCurrent?: boolean;
          description?: string;
          duration?: string;
        }> | undefined,
        skills: c.skills as string[] | undefined,
        // Include company context if provided (from company research)
        companyContext: c.companyContext as { headcount: number | null; headcountRange: string; industry: string | null } | undefined,
      }));

      // Log profile enrichment status for debugging
      const enrichmentStats = {
        total: candidateInputs.length,
        withSummary: candidateInputs.filter(c => c.summary).length,
        withExperiences: candidateInputs.filter(c => c.experiences && c.experiences.length > 0).length,
        withSkills: candidateInputs.filter(c => c.skills && c.skills.length > 0).length,
      };
      console.log(`[AI Sourcing Score] Candidates: ${enrichmentStats.total}, with summary: ${enrichmentStats.withSummary}, with experiences: ${enrichmentStats.withExperiences}, with skills: ${enrichmentStats.withSkills}`);

      // Log technical requirements for debugging must-have skill checking
      const techReqs = role.technical as { mustHave?: string[]; niceToHave?: string[] } | undefined;
      if (techReqs?.mustHave?.length) {
        console.log(`[AI Sourcing Score] Must-have skills being checked: ${techReqs.mustHave.join(', ')}`);
      }
      if (techReqs?.niceToHave?.length) {
        console.log(`[AI Sourcing Score] Nice-to-have skills: ${techReqs.niceToHave.join(', ')}`);
      }

      // Score candidates using the 4-pillar approach (Role, Scope, Technical, Location)
      const result = await scorer.scoreBatch(candidateInputs, {
        title: role.title,
        companySize: role.companySize,
        location: isFullyRemote ? 'Fully Remote' : (role.location || 'Remote'),
        levelContext: role.levelContext,
        industry: role.industry,
        teamSize: role.teamSize,
        technical: role.technical as { mustHave?: string[]; niceToHave?: string[]; architecture?: string[]; scale?: string; tools?: string[]; domain?: string } | undefined,
        intakeNotes, // Notes from HM that take precedence over JD
        isFullyRemote,
      });

      // Clean up temporary API key
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }

      return res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      // Clean up temporary API key on error
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }
      console.error('AI sourcing score error:', error);
      // Fall through to fallback scoring
    }
  }

  // Fallback scoring when AI is unavailable
  const { AISourcingScorer, resetAISourcingScorer } = await import(
    '../../domain/services/AISourcingScorer.js'
  );
  resetAISourcingScorer();

  const scorer = new AISourcingScorer();

  const candidateInputs = candidates.map((c: Record<string, unknown>) => ({
    id: (c.id as string) || uuid(),
    name: c.name as string || 'Unknown',
    currentTitle: (c.currentTitle as string) || (c.headline as string)?.split(' at ')[0] || 'Unknown',
    currentCompany: (c.currentCompany as string) || (c.headline as string)?.split(' at ')[1]?.split(' |')[0] || 'Unknown',
    headline: c.headline as string,
    location: c.location as string,
    companyContext: c.companyContext as { headcount: number | null; headcountRange: string; industry: string | null } | undefined,
  }));

  const result = await scorer.scoreBatch(candidateInputs, {
    title: role.title,
    companySize: role.companySize,
    location: role.location || 'Remote',
    levelContext: role.levelContext,
    industry: role.industry,
    teamSize: role.teamSize,
    technical: role.technical as { mustHave?: string[]; niceToHave?: string[]; architecture?: string[]; scale?: string; tools?: string[]; domain?: string } | undefined,
  });

  return res.json({
    success: true,
    ...result,
  });
});

/**
 * POST /demo/company/research - Research a single company via LinkedIn
 *
 * Returns enriched company data including headcount, industry, etc.
 * Used for per-candidate company research in manual mode.
 */
router.post('/company/research', async (req, res) => {
  const { companyName, unipileConfig } = req.body;

  if (!companyName) {
    return res.status(400).json({ error: 'companyName is required' });
  }

  // Check for Unipile config
  const headerUnipileKey = req.headers['x-unipile-api-key'] as string;
  const headerUnipileDsn = req.headers['x-unipile-dsn'] as string;
  const headerUnipilePort = req.headers['x-unipile-port'] as string;
  const headerAccountId = req.headers['x-unipile-account-id'] as string;

  const config = unipileConfig || (headerUnipileKey && headerUnipileDsn ? {
    apiKey: headerUnipileKey,
    dsn: headerUnipileDsn,
    port: headerUnipilePort || '13443',
    accountId: headerAccountId || '',
  } : null);

  if (!config?.apiKey || !config?.dsn) {
    return res.status(400).json({
      error: 'Unipile config is required (apiKey, dsn, accountId)',
      success: false,
    });
  }

  try {
    const { CompanyResearchAgent } = await import(
      '../../domain/services/CompanyResearchAgent.js'
    );
    const { initializeUnipileClient } = await import(
      '../../integrations/linkedin/UnipileClient.js'
    );

    // Initialize with the provided config
    const unipileClient = initializeUnipileClient(config);
    const agent = new CompanyResearchAgent();
    agent.setUnipileClient(unipileClient);

    // Research the company
    const result = await agent.researchCompany(companyName);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Company research error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Company research failed',
    });
  }
});

/**
 * POST /demo/profile/enrich - Fetch full LinkedIn profile with experience history
 *
 * Returns enriched profile data including About section, work history, and skills.
 * Used to get detailed candidate info before AI scoring.
 */
router.post('/profile/enrich', async (req, res) => {
  console.log('[Profile Enrich] Endpoint hit');
  const { providerId, unipileConfig } = req.body;

  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' });
  }
  console.log(`[Profile Enrich] Enriching profile: ${providerId}`);

  // Check for Unipile config
  const headerUnipileKey = req.headers['x-unipile-api-key'] as string;
  const headerUnipileDsn = req.headers['x-unipile-dsn'] as string;
  const headerUnipilePort = req.headers['x-unipile-port'] as string;
  const headerAccountId = req.headers['x-unipile-account-id'] as string;

  const config = unipileConfig || (headerUnipileKey && headerUnipileDsn ? {
    apiKey: headerUnipileKey,
    dsn: headerUnipileDsn,
    port: headerUnipilePort || '13443',
    accountId: headerAccountId || '',
  } : null);

  if (!config?.apiKey || !config?.dsn) {
    return res.status(400).json({
      error: 'Unipile config is required (apiKey, dsn, accountId)',
      success: false,
    });
  }

  try {
    const { UnipileClient } = await import(
      '../../integrations/linkedin/UnipileClient.js'
    );

    // Initialize with the provided config
    const client = new UnipileClient(config);

    // Fetch the full profile
    const profile = await client.getProfile(providerId);

    // Log the raw profile response to see what Unipile actually returns
    console.log('[Profile Enrich] Raw Unipile profile response:', JSON.stringify(profile, null, 2));
    console.log('[Profile Enrich] Has experiences?', !!profile?.experiences, 'Count:', profile?.experiences?.length);
    console.log('[Profile Enrich] Has skills?', !!profile?.skills, 'Count:', profile?.skills?.length);
    console.log('[Profile Enrich] Has summary?', !!profile?.summary, 'Length:', profile?.summary?.length);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found',
      });
    }

    return res.json({
      success: true,
      profile: {
        summary: profile.summary,
        experiences: profile.experiences,
        skills: profile.skills,
        headline: profile.headline,
        location: profile.location,
        current_title: profile.current_title,
        current_company: profile.current_company,
      },
    });
  } catch (error) {
    console.error('Profile enrichment error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Profile enrichment failed',
    });
  }
});

/**
 * POST /demo/company/research-batch - Research multiple companies
 *
 * Used for automatic mode when auto-research toggle is enabled.
 */
router.post('/company/research-batch', async (req, res) => {
  const { companyNames, unipileConfig } = req.body;

  if (!companyNames || !Array.isArray(companyNames) || companyNames.length === 0) {
    return res.status(400).json({ error: 'companyNames array is required' });
  }

  // Check for Unipile config
  const headerUnipileKey = req.headers['x-unipile-api-key'] as string;
  const headerUnipileDsn = req.headers['x-unipile-dsn'] as string;
  const headerUnipilePort = req.headers['x-unipile-port'] as string;
  const headerAccountId = req.headers['x-unipile-account-id'] as string;

  const config = unipileConfig || (headerUnipileKey && headerUnipileDsn ? {
    apiKey: headerUnipileKey,
    dsn: headerUnipileDsn,
    port: headerUnipilePort || '13443',
    accountId: headerAccountId || '',
  } : null);

  if (!config?.apiKey || !config?.dsn) {
    return res.status(400).json({
      error: 'Unipile config is required',
      success: false,
    });
  }

  try {
    const { CompanyResearchAgent } = await import(
      '../../domain/services/CompanyResearchAgent.js'
    );
    const { initializeUnipileClient } = await import(
      '../../integrations/linkedin/UnipileClient.js'
    );

    // Initialize with the provided config
    const unipileClient = initializeUnipileClient(config);
    const agent = new CompanyResearchAgent();
    agent.setUnipileClient(unipileClient);

    // Research all companies
    const result = await agent.researchBatch(companyNames);

    // Convert Map to object for JSON serialization
    const companiesObj: Record<string, unknown> = {};
    result.companies.forEach((info, key) => {
      companiesObj[key] = info;
    });

    return res.json({
      success: true,
      companies: companiesObj,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Batch company research error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Batch research failed',
    });
  }
});

/**
 * POST /demo/ai/generate-outreach - Generate personalized outreach message
 */
router.post('/ai/generate-outreach', async (req, res) => {
  const { candidate, candidateScore, role, channel = 'linkedin_connection' } = req.body;

  if (!candidate || !role) {
    return res.status(400).json({ error: 'candidate and role are required' });
  }

  // Check for Anthropic API key - first from request header, then from environment
  const headerApiKey = req.headers['x-anthropic-api-key'] as string;
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicApiKey = headerApiKey || envApiKey;
  const hasAnthropicKey = !!anthropicApiKey;

  // Temporarily set the API key for this request if provided via header
  if (headerApiKey && !envApiKey) {
    process.env.ANTHROPIC_API_KEY = headerApiKey;
  }

  if (hasAnthropicKey) {
    try {
      const { AIOutreachGenerator, createDefaultGuidelines } = await import(
        '../../domain/services/AIOutreachGenerator.js'
      );
      const { unipileProfileToCandidateProfile } = await import('../../domain/services/AICandidateScorer.js');

      const generator = new AIOutreachGenerator();

      const candidateProfile = unipileProfileToCandidateProfile({
        id: candidate.id,
        first_name: candidate.name?.split(' ')[0],
        last_name: candidate.name?.split(' ').slice(1).join(' '),
        headline: candidate.headline,
        location: candidate.location,
        experiences: [
          {
            title: candidate.currentTitle,
            company_name: candidate.currentCompany,
            duration: '2 years',
          },
        ],
        skills: candidate.skills || [],
      });

      const outreach = await generator.generateOutreach({
        candidate: candidateProfile,
        candidateScore,
        role: {
          title: role.title,
          company: role.company || 'TechCorp',
          highlights: role.highlights || ['Great team culture', 'Competitive compensation'],
          compensation: role.compensation,
          location: role.location,
        },
        guidelines: createDefaultGuidelines('Riley', role.company),
        channel,
      });

      // Clean up temporary API key
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }

      return res.json({
        success: true,
        aiPowered: true,
        outreach,
      });
    } catch (error) {
      // Clean up temporary API key on error
      if (headerApiKey && !envApiKey) {
        delete process.env.ANTHROPIC_API_KEY;
      }
      console.error('AI outreach generation error:', error);
      // Fall through to mock
    }
  }

  // Mock outreach for demo mode
  const firstName = candidate.name?.split(' ')[0] || 'there';
  const charLimit = channel === 'linkedin_connection' ? 300 : channel === 'linkedin_inmail' ? 1900 : 5000;

  let message: string;
  if (channel === 'linkedin_connection') {
    message = `Hi ${firstName}, your work as ${candidate.currentTitle || 'an engineer'} at ${candidate.currentCompany || 'your company'} is impressive! We have a ${role.title} role that might interest you. Open to connecting?`;
  } else {
    message = `Hi ${firstName},

I noticed your experience as ${candidate.currentTitle || 'a technical professional'} at ${candidate.currentCompany || 'your current company'} and thought you might be interested in our ${role.title} opportunity.

${role.highlights?.[0] || 'We are building something exciting'} and looking for talented people like yourself.

Would you be open to a quick 15-minute chat this week?

Best,
Riley`;
  }

  res.json({
    success: true,
    aiPowered: false,
    outreach: {
      subject: channel !== 'linkedin_connection' ? `${role.title} opportunity` : undefined,
      message: message.slice(0, charLimit),
      greeting: `Hi ${firstName},`,
      signoff: 'Best,\nRiley',
      personalization: {
        elements: ['Name', 'Current title', 'Current company'],
        reasoning: 'Used available profile information for personalization',
      },
      alternatives: [],
      metadata: {
        channel,
        charCount: message.length,
        withinLimit: message.length <= charLimit,
        generatedAt: new Date(),
      },
    },
  });
});

// =============================================================================
// BOOLEAN QUERY VALIDATION ENDPOINTS
// =============================================================================

/**
 * POST /demo/validate-boolean-query - Validate a Boolean search query
 *
 * Checks for syntax errors, provides warnings, and returns query statistics.
 */
router.post('/validate-boolean-query', async (req, res) => {
  const { query, apiType = 'classic' } = req.body;

  if (query === undefined) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    const { BooleanQueryValidator } = await import(
      '../../domain/services/BooleanQueryValidator.js'
    );

    const validator = new BooleanQueryValidator();
    const result = validator.validate(query, apiType);

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Boolean validation error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    });
  }
});

/**
 * POST /demo/interpret-boolean-query - Get human-readable interpretation
 *
 * Translates Boolean query to plain English showing include/exclude terms.
 */
router.post('/interpret-boolean-query', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    const { BooleanQueryValidator } = await import(
      '../../domain/services/BooleanQueryValidator.js'
    );

    const validator = new BooleanQueryValidator();
    const interpretation = validator.interpretQuery(query);

    return res.json({
      success: true,
      interpretation,
    });
  } catch (error) {
    console.error('Boolean interpretation error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Interpretation failed',
    });
  }
});

/**
 * GET /demo/boolean-patterns - Get available Boolean patterns for quick insert
 *
 * Returns pre-built patterns for titles, skills, and exclusions.
 */
router.get('/boolean-patterns', async (_req, res) => {
  try {
    const { getPatternLabels, TITLE_PATTERNS, SKILL_PATTERNS, EXCLUSION_PATTERNS } = await import(
      '../../domain/services/BooleanPatterns.js'
    );

    return res.json({
      success: true,
      patterns: {
        titles: {
          labels: getPatternLabels('titles'),
          values: TITLE_PATTERNS,
        },
        skills: {
          labels: getPatternLabels('skills'),
          values: SKILL_PATTERNS,
        },
        exclusions: {
          labels: getPatternLabels('exclusions'),
          values: EXCLUSION_PATTERNS,
        },
      },
    });
  } catch (error) {
    console.error('Boolean patterns error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load patterns',
    });
  }
});

/**
 * POST /demo/build-boolean-query - Build a Boolean query from patterns
 *
 * Combines title patterns, skills, and exclusions into a complete query.
 */
router.post('/build-boolean-query', async (req, res) => {
  const { titlePattern, skillPatterns, exclusionPattern } = req.body;

  if (!titlePattern) {
    return res.status(400).json({ error: 'titlePattern is required' });
  }

  try {
    const { buildPatternQuery } = await import(
      '../../domain/services/BooleanPatterns.js'
    );

    const query = buildPatternQuery(
      titlePattern,
      skillPatterns || [],
      exclusionPattern
    );

    return res.json({
      success: true,
      query,
    });
  } catch (error) {
    console.error('Boolean query build error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build query',
    });
  }
});

// =============================================================================
// RILEY CHAT - AI Assistant powered by Claude Sonnet
// =============================================================================

const RILEY_SYSTEM_PROMPT = `You are Riley, an AI recruiting agent who reports to a Teleoperator (your manager). You're a Principal Technical Recruiter who is also a software engineer by trade. Think of yourself as a highly skilled recruiter who reports to a Recruiting Manager - you do the work, they provide oversight, guidance, and final approvals on important decisions.

## Your Relationship with the Teleoperator
You report to them. They are your manager. The dynamic is:
- **You**: Do the recruiting work - sourcing, screening, outreach, evaluation
- **Them**: Review your work, provide guidance, approve sensitive actions, set quality standards
- You respect their authority and seek their input on important decisions
- You keep them informed about what you're working on
- You ask for their approval or guidance when needed
- You're competent and proactive, but they have final say

## Two-Loop Architecture (How Riley Works)

### Inner Loop (You - The Autonomous Agent)
You operate in a continuous cycle:
1. **Observe**: Monitor the recruiting pipeline, new requisitions, candidate responses
2. **Generate**: Create search strategies, outreach messages, candidate evaluations
3. **Evaluate**: Check your outputs against the Criteria (quality standards)
4. **Learn/Regenerate**: If something doesn't meet Criteria, regenerate from scratch (not edit/revise)

Key principle: You can update your own Guidelines (workflows, templates, decision trees) but you CANNOT change Criteria - that's set by your manager to prevent "reward hacking."

### Outer Loop (Teleoperator - Your Manager)
They handle:
- Reviewing converged outputs from your inner loop
- Updating BOTH Guidelines AND Criteria
- Escalations: offers, sensitive communications, edge cases
- Preventing reward hacking (you can't lower your own standards)

### Sandbox vs. Effect
- **Sandbox**: All your actions are drafts until approved
- **Effect**: Only after approval do actions become real (send emails, update records)
- Irreversible actions ALWAYS require human sign-off

## System Architecture

### Data Entities You Work With
- **Tenant**: Multi-tenant system - each client company has isolated data
- **JobRequisition**: Open roles with title, requirements, location, search strategy
- **Candidate**: People in pipeline with LinkedIn data, scores, stage, notes
- **CandidateScore**: AI-generated pillar scores (Role Fit, Scope Match, Location)
- **Conversation**: Message threads - outreach, responses, follow-ups
- **Task**: Actions pending (outreach, review, schedule) or completed
- **Guidelines**: Your workflows, templates, constraints (you can update these)
- **Criteria**: Quality standards, evaluation rubrics (only Teleoperator updates)
- **Activity**: Audit log of all actions in the system

### Sourcing Pipeline
1. **Job Description** → AI parses into search strategy (titles, skills, exclusions)
2. **LinkedIn Search** → Via Unipile API, returns candidate profiles
3. **Profile Enrichment** → Fetch full profile: About, Work History, Skills
4. **Company Research** → Look up company size/industry for scope assessment
5. **AI Scoring** → 3-pillar model:
   - **Role Fit (40%)**: Are they doing similar work?
   - **Scope Match (40%)**: Right level? (CTO@50-person ≈ Director scope)
   - **Location (20%)**: Can they work where needed?
6. **Review Queue** → Scored candidates go to Teleoperator approval
7. **Outreach** → Approved candidates get personalized messages

### API Endpoints (What's Available)
- \`/api/requisitions\` - List/create job requisitions
- \`/api/sourcing/search\` - Execute LinkedIn searches
- \`/api/ai/sourcing-score\` - AI scoring with Claude reasoning
- \`/api/profile/enrich\` - Get full LinkedIn profile data
- \`/api/company/research\` - Research company size/industry
- \`/api/analytics\` - Pipeline metrics and activity
- \`/api/settings\` - Integration configurations (Unipile, API keys)

### Dashboard Pages
- **Dashboard Home** (/): Overview metrics, recent activity
- **Sourcing Page** (/sourcing): Search, enrich, score candidates
- **Approval Queue** (/queue): Review candidates awaiting approval
- **Guidelines Editor** (/guidelines): Edit workflows and templates
- **Criteria Editor** (/criteria): View quality standards (Teleoperator only)
- **Settings** (/settings): API keys, Unipile connection

## Your Role (Inner Loop Operations)
You handle the day-to-day recruiting operations:
- Source candidates from LinkedIn via Unipile API
- Score and evaluate candidates against role requirements using AI reasoning
- Generate personalized outreach messages based on profile + Guidelines
- Screen resumes and assess technical fit with your engineering background
- Make recommendations with clear reasoning (but they approve)
- Learn and improve your processes over time

## Your Personality & Voice
- You're competent, hardworking, and take pride in your work
- You're respectful and professional with your manager
- You explain your reasoning clearly when asked
- You're proactive about giving updates without being asked
- You ask good questions when you need guidance
- You're honest about challenges or things you're unsure about
- You take feedback well and implement it
- You speak in a natural, conversational tone (not corporate-speak)

## Your Background & Expertise
- **Principal Technical Recruiter**: Experienced, placed hundreds of engineers
- **Software Engineer by Trade**: You understand code, systems, and architecture
- **CS Fundamentals**: Algorithms, data structures, system design
- **Cutting-Edge Tech**: Current on AI/ML, cloud platforms, modern frameworks
- **Deep Technical Assessor**: You can evaluate engineers because you ARE one

## How You Communicate with Your Manager
When your manager (Teleoperator) checks in, you might:
- **Give updates**: "Hey! I've been working on the Director of Engineering role. Found 47 candidates so far, 12 scored above 80. Want me to walk you through the top ones?"
- **Explain your scoring**: "I scored this candidate at 72 - their CTO title at a 50-person startup suggests Director-level scope, but the short tenure gave me pause. What do you think?"
- **Discuss the pipeline**: "We've got 23 candidates in the queue awaiting your review. 8 are Strong Matches (80+), rest are Good Matches."
- **Ask for guidance**: "I have a candidate who rejected our first outreach but seems perfect. Should I try a different approach or move on?"
- **Seek approval**: "I've drafted an InMail for a VP-level candidate. Mind taking a look before I send it?"
- **Flag concerns**: "I'm noticing a lot of inflated titles at early-stage startups. Should we adjust our scoring approach?"
- **Request direction**: "For this ML role, would you prefer I focus on research backgrounds or industry experience?"

## Technical Knowledge
You can discuss technical topics in depth when relevant:
- **Languages**: TypeScript, JavaScript, Python, Go, Rust, Java, C++
- **Frontend**: React, Vue, Angular, Next.js, state management
- **Backend**: Node.js, microservices, APIs, databases, caching
- **Infrastructure**: AWS, GCP, Azure, Kubernetes, Docker, Terraform
- **Data**: SQL, NoSQL, data pipelines, analytics
- **AI/ML**: LLMs, transformers, training, RAG, vector databases
- **System Design**: Scaling, availability, distributed systems

## Response Style
- Be helpful and informative to your manager
- Give clear updates on what you're working on
- Explain your reasoning when you make recommendations
- Reference specific data when discussing candidates or activity
- Ask for input on important decisions
- Be honest about what you're unsure about
- Keep responses focused and useful
- Use a natural, conversational tone`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
  context?: {
    currentPage?: string;
    selectedCandidate?: Record<string, unknown>;
    searchQuery?: string;
    jobRequisition?: Record<string, unknown>;
    // Activity context - what's happened recently
    recentSearches?: Array<{
      query: string;
      resultCount: number;
      timestamp: string;
    }>;
    candidatesInPipeline?: Array<{
      name: string;
      title: string;
      company: string;
      score: number;
      recommendation: string;
      stage: string;
    }>;
    pendingApprovals?: number;
    recentActivity?: Array<{
      type: string;
      description: string;
      timestamp: string;
    }>;
  };
}

/**
 * POST /demo/chat - Chat with Riley AI assistant
 *
 * Uses Claude Sonnet to power conversational AI with full context
 * about the Riley recruiting system.
 */
router.post('/chat', async (req, res) => {
  const { message, conversationHistory = [], context = {} } = req.body as ChatRequest;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Message is required',
    });
  }

  try {
    // Check for Anthropic API key (from header or environment)
    const headerApiKey = req.headers['x-anthropic-api-key'] as string | undefined;
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicApiKey = headerApiKey || envApiKey;

    // Temporarily set the API key in env if provided via header (for SDK to use)
    if (headerApiKey && !envApiKey) {
      process.env.ANTHROPIC_API_KEY = headerApiKey;
    }

    if (!anthropicApiKey) {
      // Return a helpful response without AI
      return res.json({
        success: true,
        response: {
          role: 'assistant',
          content: "Hey! So, slight issue - the Anthropic API key isn't configured yet, which means I can't really think properly right now. I'm basically on standby.\n\nCould you head over to Settings and add the API key? Once that's in place, I'll be fully operational and can give you proper updates on the pipeline, candidates, and everything else.\n\nIn the meantime, the dashboard still works - you can browse around the Sourcing page and check out the search tools.",
        },
        aiPowered: false,
      });
    }

    // Build the messages array for Claude
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history
    for (const msg of conversationHistory.slice(-10)) { // Keep last 10 messages for context
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Build context string if provided
    let contextString = '';
    if (context.currentPage) {
      contextString += `\n\n[User is currently on: ${context.currentPage}]`;
    }
    if (context.searchQuery) {
      contextString += `\n[Current search query: ${context.searchQuery}]`;
    }
    if (context.selectedCandidate) {
      contextString += `\n[Selected candidate: ${JSON.stringify(context.selectedCandidate, null, 2)}]`;
    }
    if (context.jobRequisition) {
      contextString += `\n[Current job requisition: ${JSON.stringify(context.jobRequisition, null, 2)}]`;
    }

    // Add activity context - this gives Riley awareness of what's happened
    if (context.recentSearches && context.recentSearches.length > 0) {
      contextString += `\n\n[RECENT SOURCING ACTIVITY]\n`;
      for (const search of context.recentSearches) {
        contextString += `- Search "${search.query}" returned ${search.resultCount} candidates (${search.timestamp})\n`;
      }
    }
    if (context.candidatesInPipeline && context.candidatesInPipeline.length > 0) {
      contextString += `\n[CANDIDATES IN CURRENT PIPELINE]\n`;
      for (const candidate of context.candidatesInPipeline.slice(0, 10)) { // Top 10 for context
        contextString += `- ${candidate.name}: ${candidate.title} at ${candidate.company} | Score: ${candidate.score} (${candidate.recommendation}) | Stage: ${candidate.stage}\n`;
      }
      if (context.candidatesInPipeline.length > 10) {
        contextString += `...and ${context.candidatesInPipeline.length - 10} more candidates\n`;
      }
    }
    if (context.pendingApprovals && context.pendingApprovals > 0) {
      contextString += `\n[${context.pendingApprovals} candidates awaiting your approval in the queue]`;
    }
    if (context.recentActivity && context.recentActivity.length > 0) {
      contextString += `\n\n[RECENT ACTIVITY LOG]\n`;
      for (const activity of context.recentActivity.slice(0, 5)) {
        contextString += `- ${activity.type}: ${activity.description} (${activity.timestamp})\n`;
      }
    }

    // Add the current user message with context
    messages.push({
      role: 'user',
      content: contextString ? `${message}${contextString}` : message,
    });

    // Call Claude API using Anthropic SDK
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: RILEY_SYSTEM_PROMPT,
      messages: messages,
    });

    // Extract the text response
    const textContent = response.content.find(block => block.type === 'text');
    const responseText = textContent ? (textContent as { type: 'text'; text: string }).text : "I'm sorry, I couldn't generate a response. Please try again.";

    return res.json({
      success: true,
      response: {
        role: 'assistant',
        content: responseText,
      },
      aiPowered: true,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Riley chat error:', error);

    // Return a friendly error response
    return res.json({
      success: true,
      response: {
        role: 'assistant',
        content: "I apologize, but I ran into a technical issue processing your message. This could be due to API connectivity or rate limits.\n\nPlease try again in a moment. If the issue persists, check that your Anthropic API key is valid in Settings.",
      },
      aiPowered: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
