/**
 * ATS Integration Client - Unified API for Multiple ATS Platforms
 *
 * Provides a unified interface to interact with various Applicant Tracking Systems
 * via unified.to or merge.dev style API aggregation.
 *
 * Supported ATS Platforms:
 * - Greenhouse
 * - Lever
 * - Ashby
 * - Workday
 * - BambooHR
 *
 * Key Operations:
 * - Sync candidates bidirectionally
 * - Update pipeline stages
 * - Create/update job requisitions
 * - Fetch interview feedback
 */

import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface ATSConfig {
  provider: 'unified' | 'merge' | 'direct';
  apiKey: string;
  baseUrl: string;
  atsType: ATSType;
  connectionId?: string; // For unified API connections
  webhookSecret?: string;
}

export type ATSType =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'bamboohr'
  | 'workable'
  | 'jobvite'
  | 'icims';

// Unified Candidate Model
export interface ATSCandidate {
  id: string;
  externalId: string;
  atsType: ATSType;

  // Basic Info
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;

  // Professional
  currentTitle?: string;
  currentCompany?: string;
  linkedInUrl?: string;
  resumeUrl?: string;

  // Application
  applications: ATSApplication[];

  // Metadata
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ATSApplication {
  id: string;
  externalId: string;
  jobId: string;
  jobTitle: string;
  stage: string;
  stageId: string;
  status: 'active' | 'rejected' | 'hired' | 'withdrawn';
  appliedAt: Date;
  updatedAt: Date;
  rejectionReason?: string;
}

// Unified Job Model
export interface ATSJob {
  id: string;
  externalId: string;
  atsType: ATSType;

  // Details
  title: string;
  description?: string;
  department?: string;
  location?: string;
  employmentType?: string;

  // Pipeline
  stages: ATSStage[];

  // Status
  status: 'open' | 'closed' | 'draft' | 'archived';
  openedAt?: Date;
  closedAt?: Date;

  // Hiring Team
  hiringManager?: ATSUser;
  recruiters?: ATSUser[];

  // Metadata
  customFields?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ATSStage {
  id: string;
  externalId: string;
  name: string;
  type: 'sourced' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'custom';
  order: number;
}

export interface ATSUser {
  id: string;
  externalId: string;
  name: string;
  email: string;
  role?: string;
}

export interface ATSActivity {
  id: string;
  candidateId: string;
  type: 'note' | 'email' | 'stage_change' | 'scorecard' | 'interview' | 'offer';
  content?: string;
  metadata?: Record<string, unknown>;
  createdBy?: ATSUser;
  createdAt: Date;
}

export interface ATSScorecard {
  id: string;
  applicationId: string;
  interviewerId: string;
  interviewerName: string;
  rating: number; // Usually 1-5
  recommendation: 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';
  notes?: string;
  attributes?: Array<{
    name: string;
    rating: number;
    notes?: string;
  }>;
  submittedAt: Date;
}

// =============================================================================
// ATS CLIENT
// =============================================================================

export class ATSClient {
  private config: ATSConfig;

  constructor(config: ATSConfig) {
    this.config = config;
  }

  // ===========================================================================
  // CANDIDATES
  // ===========================================================================

  /**
   * Get candidate by external ID
   */
  async getCandidate(externalId: string): Promise<ATSCandidate | null> {
    const response = await this.request<ATSCandidateResponse>(
      'GET',
      `/candidates/${externalId}`
    );

    if (!response) return null;
    return this.normalizeCandidate(response);
  }

  /**
   * Search candidates
   */
  async searchCandidates(query: {
    email?: string;
    name?: string;
    jobId?: string;
    stage?: string;
    updatedAfter?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ candidates: ATSCandidate[]; total: number }> {
    const params = new URLSearchParams();
    if (query.email) params.set('email', query.email);
    if (query.name) params.set('name', query.name);
    if (query.jobId) params.set('job_id', query.jobId);
    if (query.stage) params.set('stage', query.stage);
    if (query.updatedAfter) params.set('updated_after', query.updatedAfter.toISOString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.offset) params.set('offset', query.offset.toString());

    const response = await this.request<ATSListResponse<ATSCandidateResponse>>(
      'GET',
      `/candidates?${params.toString()}`
    );

    return {
      candidates: (response?.data || []).map((c) => this.normalizeCandidate(c)),
      total: response?.total || 0,
    };
  }

  /**
   * Create a new candidate
   */
  async createCandidate(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    resumeUrl?: string;
    linkedInUrl?: string;
    source?: string;
    tags?: string[];
  }): Promise<ATSCandidate> {
    const response = await this.request<ATSCandidateResponse>('POST', '/candidates', {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      resume_url: data.resumeUrl,
      linkedin_url: data.linkedInUrl,
      source: data.source,
      tags: data.tags,
    });

    return this.normalizeCandidate(response!);
  }

  /**
   * Update candidate
   */
  async updateCandidate(
    externalId: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      linkedInUrl: string;
      tags: string[];
      customFields: Record<string, unknown>;
    }>
  ): Promise<ATSCandidate> {
    const response = await this.request<ATSCandidateResponse>(
      'PATCH',
      `/candidates/${externalId}`,
      {
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone,
        linkedin_url: data.linkedInUrl,
        tags: data.tags,
        custom_fields: data.customFields,
      }
    );

    return this.normalizeCandidate(response!);
  }

  // ===========================================================================
  // APPLICATIONS
  // ===========================================================================

  /**
   * Create application for candidate
   */
  async createApplication(
    candidateId: string,
    jobId: string,
    data?: {
      source?: string;
      referrer?: string;
    }
  ): Promise<ATSApplication> {
    const response = await this.request<ATSApplicationResponse>('POST', '/applications', {
      candidate_id: candidateId,
      job_id: jobId,
      source: data?.source,
      referrer: data?.referrer,
    });

    return this.normalizeApplication(response!);
  }

  /**
   * Move application to new stage
   */
  async moveToStage(applicationId: string, stageId: string): Promise<ATSApplication> {
    const response = await this.request<ATSApplicationResponse>(
      'POST',
      `/applications/${applicationId}/move`,
      { stage_id: stageId }
    );

    return this.normalizeApplication(response!);
  }

  /**
   * Reject application
   */
  async rejectApplication(
    applicationId: string,
    reason?: string,
    sendEmail?: boolean
  ): Promise<ATSApplication> {
    const response = await this.request<ATSApplicationResponse>(
      'POST',
      `/applications/${applicationId}/reject`,
      {
        rejection_reason: reason,
        send_email: sendEmail ?? false,
      }
    );

    return this.normalizeApplication(response!);
  }

  // ===========================================================================
  // JOBS
  // ===========================================================================

  /**
   * Get job by external ID
   */
  async getJob(externalId: string): Promise<ATSJob | null> {
    const response = await this.request<ATSJobResponse>('GET', `/jobs/${externalId}`);
    if (!response) return null;
    return this.normalizeJob(response);
  }

  /**
   * List jobs
   */
  async listJobs(query?: {
    status?: 'open' | 'closed' | 'all';
    department?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: ATSJob[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.department) params.set('department', query.department);
    if (query?.limit) params.set('limit', query.limit.toString());
    if (query?.offset) params.set('offset', query.offset.toString());

    const response = await this.request<ATSListResponse<ATSJobResponse>>(
      'GET',
      `/jobs?${params.toString()}`
    );

    return {
      jobs: (response?.data || []).map((j) => this.normalizeJob(j)),
      total: response?.total || 0,
    };
  }

  /**
   * Get job stages
   */
  async getJobStages(jobId: string): Promise<ATSStage[]> {
    const response = await this.request<ATSStageResponse[]>('GET', `/jobs/${jobId}/stages`);
    return (response || []).map((s) => this.normalizeStage(s));
  }

  // ===========================================================================
  // ACTIVITIES
  // ===========================================================================

  /**
   * Add activity/note to candidate
   */
  async addActivity(
    candidateId: string,
    type: ATSActivity['type'],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<ATSActivity> {
    const response = await this.request<ATSActivityResponse>(
      'POST',
      `/candidates/${candidateId}/activities`,
      {
        type,
        content,
        metadata,
      }
    );

    return this.normalizeActivity(response!);
  }

  /**
   * Get candidate activities
   */
  async getActivities(candidateId: string, limit?: number): Promise<ATSActivity[]> {
    const params = limit ? `?limit=${limit}` : '';
    const response = await this.request<ATSActivityResponse[]>(
      'GET',
      `/candidates/${candidateId}/activities${params}`
    );

    return (response || []).map((a) => this.normalizeActivity(a));
  }

  // ===========================================================================
  // SCORECARDS
  // ===========================================================================

  /**
   * Get scorecards for application
   */
  async getScorecards(applicationId: string): Promise<ATSScorecard[]> {
    const response = await this.request<ATSScorecardResponse[]>(
      'GET',
      `/applications/${applicationId}/scorecards`
    );

    return (response || []).map((s) => this.normalizeScorecard(s));
  }

  /**
   * Submit scorecard
   */
  async submitScorecard(
    applicationId: string,
    data: {
      rating: number;
      recommendation: ATSScorecard['recommendation'];
      notes?: string;
      attributes?: ATSScorecard['attributes'];
    }
  ): Promise<ATSScorecard> {
    const response = await this.request<ATSScorecardResponse>(
      'POST',
      `/applications/${applicationId}/scorecards`,
      data
    );

    return this.normalizeScorecard(response!);
  }

  // ===========================================================================
  // SYNC
  // ===========================================================================

  /**
   * Full sync of candidates updated since a given date
   */
  async syncCandidates(
    since: Date,
    onCandidate: (candidate: ATSCandidate) => Promise<void>,
    options?: { batchSize?: number }
  ): Promise<{ synced: number; errors: number }> {
    const batchSize = options?.batchSize || 100;
    let offset = 0;
    let synced = 0;
    let errors = 0;

    while (true) {
      const { candidates, total } = await this.searchCandidates({
        updatedAfter: since,
        limit: batchSize,
        offset,
      });

      for (const candidate of candidates) {
        try {
          await onCandidate(candidate);
          synced++;
        } catch (error) {
          console.error(`[ATSClient] Error syncing candidate ${candidate.id}:`, error);
          errors++;
        }
      }

      offset += batchSize;
      if (offset >= total) break;
    }

    return { synced, errors };
  }

  /**
   * Sync jobs
   */
  async syncJobs(
    onJob: (job: ATSJob) => Promise<void>,
    options?: { status?: 'open' | 'closed' | 'all' }
  ): Promise<{ synced: number; errors: number }> {
    const { jobs } = await this.listJobs({
      status: options?.status || 'open',
      limit: 1000,
    });

    let synced = 0;
    let errors = 0;

    for (const job of jobs) {
      try {
        await onJob(job);
        synced++;
      } catch (error) {
        console.error(`[ATSClient] Error syncing job ${job.id}:`, error);
        errors++;
      }
    }

    return { synced, errors };
  }

  // ===========================================================================
  // WEBHOOKS
  // ===========================================================================

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn('[ATSClient] No webhook secret configured');
      return false;
    }

    // Implementation depends on ATS provider
    // Most use HMAC-SHA256
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  /**
   * Parse webhook event
   */
  parseWebhookEvent(payload: unknown): ATSWebhookEvent | null {
    const data = payload as Record<string, unknown>;

    // Normalize based on ATS type
    switch (this.config.atsType) {
      case 'greenhouse':
        return this.parseGreenhouseWebhook(data);
      case 'lever':
        return this.parseLeverWebhook(data);
      default:
        return this.parseGenericWebhook(data);
    }
  }

  private parseGreenhouseWebhook(data: Record<string, unknown>): ATSWebhookEvent | null {
    const action = data.action as string;
    const payload = data.payload as Record<string, unknown>;

    return {
      type: this.mapWebhookType(action),
      entityType: (payload?.type as string) || 'unknown',
      entityId: (payload?.id as string) || '',
      data: payload,
      timestamp: new Date(),
    };
  }

  private parseLeverWebhook(data: Record<string, unknown>): ATSWebhookEvent | null {
    return {
      type: (data.event as string) || 'unknown',
      entityType: (data.type as string) || 'unknown',
      entityId: (data.id as string) || '',
      data: data.data as Record<string, unknown>,
      timestamp: new Date((data.triggered_at as number) || Date.now()),
    };
  }

  private parseGenericWebhook(data: Record<string, unknown>): ATSWebhookEvent | null {
    return {
      type: (data.event_type as string) || (data.type as string) || 'unknown',
      entityType: (data.entity_type as string) || 'unknown',
      entityId: (data.entity_id as string) || (data.id as string) || '',
      data: data,
      timestamp: new Date(),
    };
  }

  private mapWebhookType(action: string): string {
    const mapping: Record<string, string> = {
      candidate_hired: 'candidate.hired',
      candidate_rejected: 'candidate.rejected',
      candidate_stage_changed: 'candidate.stage_change',
      application_created: 'application.created',
      interview_scheduled: 'interview.scheduled',
      offer_created: 'offer.created',
    };
    return mapping[action] || action;
  }

  // ===========================================================================
  // HTTP CLIENT
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    const url = `${this.config.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    // Add connection ID for unified APIs
    if (this.config.connectionId) {
      headers['x-connection-id'] = this.config.connectionId;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`ATS API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error(`[ATSClient] Request failed: ${method} ${path}`, error);
      throw error;
    }
  }

  // ===========================================================================
  // NORMALIZERS
  // ===========================================================================

  private normalizeCandidate(data: ATSCandidateResponse): ATSCandidate {
    // Handle source which can be string or object
    let source: string | undefined;
    if (typeof data.source === 'object' && data.source?.name) {
      source = data.source.name;
    } else if (typeof data.source === 'string') {
      source = data.source;
    }

    return {
      id: uuid(),
      externalId: data.id,
      atsType: this.config.atsType,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email || data.emails?.[0]?.value || '',
      phone: data.phone || data.phone_numbers?.[0]?.value,
      currentTitle: data.title || data.current_title,
      currentCompany: data.company || data.current_company,
      linkedInUrl: data.linkedin_url || data.social_links?.linkedin,
      resumeUrl: data.resume_url || data.attachments?.[0]?.url,
      applications: (data.applications || []).map((a) => this.normalizeApplication(a)),
      source,
      tags: data.tags || [],
      customFields: data.custom_fields,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private normalizeApplication(data: ATSApplicationResponse): ATSApplication {
    return {
      id: uuid(),
      externalId: data.id,
      jobId: data.job?.id || data.job_id || '',
      jobTitle: data.job?.name || data.job_title || '',
      stage: data.stage?.name || data.current_stage || '',
      stageId: data.stage?.id || data.stage_id || '',
      status: this.normalizeStatus(data.status),
      appliedAt: new Date(data.applied_at || data.created_at),
      updatedAt: new Date(data.updated_at),
      rejectionReason: data.rejection_reason,
    };
  }

  private normalizeJob(data: ATSJobResponse): ATSJob {
    // Handle department and location which can be string or object
    let department: string | undefined;
    if (typeof data.department === 'object' && data.department?.name) {
      department = data.department.name;
    } else if (typeof data.department === 'string') {
      department = data.department;
    }

    let location: string | undefined;
    if (typeof data.location === 'object' && data.location?.name) {
      location = data.location.name;
    } else if (typeof data.location === 'string') {
      location = data.location;
    }

    return {
      id: uuid(),
      externalId: data.id,
      atsType: this.config.atsType,
      title: data.name || data.title || '',
      description: data.description || data.content,
      department,
      location,
      employmentType: data.employment_type,
      stages: (data.stages || []).map((s) => this.normalizeStage(s)),
      status: this.normalizeJobStatus(data.status),
      openedAt: data.opened_at ? new Date(data.opened_at) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
      hiringManager: data.hiring_manager
        ? this.normalizeUser(data.hiring_manager)
        : undefined,
      recruiters: data.recruiters?.map((r) => this.normalizeUser(r)),
      customFields: data.custom_fields,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private normalizeStage(data: ATSStageResponse): ATSStage {
    return {
      id: uuid(),
      externalId: data.id,
      name: data.name,
      type: this.normalizeStageType(data.type || data.name),
      order: data.priority || data.order || 0,
    };
  }

  private normalizeUser(data: ATSUserResponse): ATSUser {
    return {
      id: uuid(),
      externalId: data.id,
      name: data.name || `${data.first_name} ${data.last_name}`,
      email: data.email,
      role: data.role,
    };
  }

  private normalizeActivity(data: ATSActivityResponse): ATSActivity {
    return {
      id: uuid(),
      candidateId: data.candidate_id,
      type: data.type as ATSActivity['type'],
      content: data.body || data.content,
      metadata: data.metadata,
      createdBy: data.user ? this.normalizeUser(data.user) : undefined,
      createdAt: new Date(data.created_at),
    };
  }

  private normalizeScorecard(data: ATSScorecardResponse): ATSScorecard {
    return {
      id: uuid(),
      applicationId: data.application_id,
      interviewerId: data.interviewer?.id || data.submitted_by || '',
      interviewerName: data.interviewer?.name || data.submitted_by_name || '',
      rating: data.overall_recommendation_score || data.rating || 0,
      recommendation: this.normalizeRecommendation(data.overall_recommendation),
      notes: data.notes,
      attributes: data.attributes?.map((a) => ({
        name: a.name,
        rating: a.rating,
        notes: a.notes,
      })),
      submittedAt: new Date(data.submitted_at || data.created_at),
    };
  }

  private normalizeStatus(status: string): ATSApplication['status'] {
    const mapping: Record<string, ATSApplication['status']> = {
      active: 'active',
      hired: 'hired',
      rejected: 'rejected',
      withdrawn: 'withdrawn',
      declined: 'withdrawn',
    };
    return mapping[status?.toLowerCase()] || 'active';
  }

  private normalizeJobStatus(status: string): ATSJob['status'] {
    const mapping: Record<string, ATSJob['status']> = {
      open: 'open',
      live: 'open',
      closed: 'closed',
      filled: 'closed',
      draft: 'draft',
      archived: 'archived',
    };
    return mapping[status?.toLowerCase()] || 'open';
  }

  private normalizeStageType(type: string): ATSStage['type'] {
    const lower = type.toLowerCase();
    if (lower.includes('source') || lower.includes('applied')) return 'sourced';
    if (lower.includes('screen')) return 'screening';
    if (lower.includes('interview') || lower.includes('onsite')) return 'interview';
    if (lower.includes('offer')) return 'offer';
    if (lower.includes('hire') || lower.includes('accept')) return 'hired';
    if (lower.includes('reject')) return 'rejected';
    return 'custom';
  }

  private normalizeRecommendation(rec: string): ATSScorecard['recommendation'] {
    const mapping: Record<string, ATSScorecard['recommendation']> = {
      strong_yes: 'strong_yes',
      definitely_yes: 'strong_yes',
      yes: 'yes',
      no_decision: 'neutral',
      neutral: 'neutral',
      no: 'no',
      definitely_not: 'strong_no',
      strong_no: 'strong_no',
    };
    return mapping[rec?.toLowerCase()] || 'neutral';
  }
}

// =============================================================================
// RESPONSE TYPES (from unified API)
// =============================================================================

interface ATSListResponse<T> {
  data: T[];
  total: number;
  has_more?: boolean;
  next_cursor?: string;
}

interface ATSCandidateResponse {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  emails?: Array<{ value: string; type: string }>;
  phone?: string;
  phone_numbers?: Array<{ value: string; type: string }>;
  title?: string;
  current_title?: string;
  company?: string;
  current_company?: string;
  linkedin_url?: string;
  social_links?: { linkedin?: string };
  resume_url?: string;
  attachments?: Array<{ url: string; type: string }>;
  applications?: ATSApplicationResponse[];
  source?: { name: string } | string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ATSApplicationResponse {
  id: string;
  job?: { id: string; name: string };
  job_id?: string;
  job_title?: string;
  stage?: { id: string; name: string };
  stage_id?: string;
  current_stage?: string;
  status: string;
  applied_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

interface ATSJobResponse {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  content?: string;
  department?: { name: string } | string;
  location?: { name: string } | string;
  employment_type?: string;
  stages?: ATSStageResponse[];
  status: string;
  opened_at?: string;
  closed_at?: string;
  hiring_manager?: ATSUserResponse;
  recruiters?: ATSUserResponse[];
  custom_fields?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ATSStageResponse {
  id: string;
  name: string;
  type?: string;
  priority?: number;
  order?: number;
}

interface ATSUserResponse {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role?: string;
}

interface ATSActivityResponse {
  id: string;
  candidate_id: string;
  type: string;
  body?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  user?: ATSUserResponse;
  created_at: string;
}

interface ATSScorecardResponse {
  id: string;
  application_id: string;
  interviewer?: { id: string; name: string };
  submitted_by?: string;
  submitted_by_name?: string;
  overall_recommendation_score?: number;
  rating?: number;
  overall_recommendation: string;
  notes?: string;
  attributes?: Array<{
    name: string;
    rating: number;
    notes?: string;
  }>;
  submitted_at?: string;
  created_at: string;
}

export interface ATSWebhookEvent {
  type: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ATSClient | null = null;

export function initializeATSClient(config: ATSConfig): ATSClient {
  instance = new ATSClient(config);
  return instance;
}

export function getATSClient(): ATSClient {
  if (!instance) {
    throw new Error('ATSClient not initialized. Call initializeATSClient first.');
  }
  return instance;
}
