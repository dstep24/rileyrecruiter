/**
 * API Client for Riley Dashboard
 *
 * Handles all communication with the Riley API server.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// =============================================================================
// TYPES
// =============================================================================

export interface Task {
  id: string;
  tenantId: string;
  type: string;
  status: string;
  priority: string;
  payload: Record<string, unknown>;
  escalationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Guidelines {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  workflows: unknown;
  templates: unknown;
  constraints: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Criteria {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  qualityStandards: unknown;
  evaluationRubrics: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  stage: string;
  status: string;
  overallScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// =============================================================================
// API CLIENT
// =============================================================================

class ApiClient {
  private baseUrl: string;
  private defaultTenantId: string = 'demo-tenant';

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setTenantId(tenantId: string) {
    this.defaultTenantId = tenantId;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': this.defaultTenantId,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        return { error: error.error || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error('[API]', error);
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  async getHealth() {
    return this.request<{ status: string; timestamp: string }>('/health');
  }

  // ===========================================================================
  // TENANTS
  // ===========================================================================

  async getTenants() {
    return this.request<Tenant[]>('/api/tenants');
  }

  async getTenant(id: string) {
    return this.request<Tenant>(`/api/tenants/${id}`);
  }

  async createTenant(data: { name: string; slug: string }) {
    return this.request<Tenant>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateTenant(id: string, data: Partial<Tenant>) {
    return this.request<Tenant>(`/api/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ===========================================================================
  // TASKS
  // ===========================================================================

  async getTasks(tenantId?: string) {
    const tid = tenantId || this.defaultTenantId;
    return this.request<Task[]>(`/api/tenants/${tid}/tasks`);
  }

  async getPendingTasks(tenantId?: string) {
    const tid = tenantId || this.defaultTenantId;
    return this.request<Task[]>(`/api/tenants/${tid}/tasks/pending`);
  }

  async approveTask(taskId: string) {
    return this.request<Task>(`/api/tasks/${taskId}/approve`, {
      method: 'POST',
    });
  }

  async rejectTask(taskId: string, reason: string) {
    return this.request<Task>(`/api/tasks/${taskId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async editAndApproveTask(taskId: string, payload: Record<string, unknown>) {
    return this.request<Task>(`/api/tasks/${taskId}/edit-approve`, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  }

  // ===========================================================================
  // GUIDELINES
  // ===========================================================================

  async getGuidelines(tenantId?: string) {
    const tid = tenantId || this.defaultTenantId;
    return this.request<Guidelines>(`/api/tenants/${tid}/guidelines`);
  }

  async getGuidelinesVersions(tenantId?: string) {
    const tid = tenantId || this.defaultTenantId;
    return this.request<Guidelines[]>(`/api/tenants/${tid}/guidelines/versions`);
  }

  async updateGuidelines(tenantId: string, data: Partial<Guidelines>) {
    return this.request<Guidelines>(`/api/tenants/${tenantId}/guidelines`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ===========================================================================
  // CRITERIA
  // ===========================================================================

  async getCriteria(tenantId?: string) {
    const tid = tenantId || this.defaultTenantId;
    return this.request<Criteria>(`/api/tenants/${tid}/criteria`);
  }

  async updateCriteria(tenantId: string, data: Partial<Criteria>) {
    return this.request<Criteria>(`/api/tenants/${tenantId}/criteria`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ===========================================================================
  // CANDIDATES
  // ===========================================================================

  async getCandidates(tenantId?: string, params?: { stage?: string; status?: string }) {
    const tid = tenantId || this.defaultTenantId;
    const query = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.request<Candidate[]>(`/api/tenants/${tid}/candidates${query}`);
  }

  // ===========================================================================
  // INNER LOOP (TRIGGERS)
  // ===========================================================================

  async triggerInnerLoop(tenantId: string, taskType: string, context: Record<string, unknown>) {
    return this.request<{ runId: string }>(`/api/tenants/${tenantId}/inner-loop/run`, {
      method: 'POST',
      body: JSON.stringify({ taskType, context }),
    });
  }

  async triggerSourcing(tenantId: string, requisitionId: string) {
    return this.request<{ runId: string }>(`/api/tenants/${tenantId}/actions/source`, {
      method: 'POST',
      body: JSON.stringify({ requisitionId }),
    });
  }

  async triggerOutreach(tenantId: string, candidateIds: string[]) {
    return this.request<{ count: number }>(`/api/tenants/${tenantId}/actions/outreach`, {
      method: 'POST',
      body: JSON.stringify({ candidateIds }),
    });
  }

  // ===========================================================================
  // ANALYTICS
  // ===========================================================================

  async getAnalytics(tenantId?: string, period: 'day' | 'week' | 'month' = 'week') {
    const tid = tenantId || this.defaultTenantId;
    return this.request<{
      tasks: { total: number; approved: number; rejected: number };
      candidates: { sourced: number; contacted: number; responded: number };
      responseRate: number;
      avgApprovalTime: number;
    }>(`/api/tenants/${tid}/analytics?period=${period}`);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const api = new ApiClient(API_BASE);
export default api;
