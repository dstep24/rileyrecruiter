/**
 * DomainRepository
 *
 * Data access layer for DomainConfig entities.
 * Handles CRUD operations and domain selection queries.
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type {
  DomainConfig,
  DomainStatus,
  DomainSelectionRule,
  DomainConfigOverrides,
  CreateDomainConfigInput,
  UpdateDomainConfigInput,
  DomainLearningRecord,
} from '../entities/DomainConfig.js';

// =============================================================================
// DOMAIN REPOSITORY
// =============================================================================

export class DomainRepository {
  private db = prisma;

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new domain configuration
   */
  async create(input: CreateDomainConfigInput): Promise<DomainConfig> {
    const domain = await this.db.domainConfig.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        selectionRules: input.selectionRules || [],
        priority: input.priority || 0,
        isDefault: input.isDefault || false,
        guidelinesId: input.guidelinesId,
        criteriaId: input.criteriaId,
        configOverrides: input.configOverrides || {},
        status: 'ACTIVE',
      },
    });

    return this.mapToDomain(domain);
  }

  /**
   * Get domain by ID
   */
  async getById(id: string): Promise<DomainConfig | null> {
    const domain = await this.db.domainConfig.findUnique({
      where: { id },
    });

    return domain ? this.mapToDomain(domain) : null;
  }

  /**
   * Get domain by slug within a tenant
   */
  async getBySlug(tenantId: string, slug: string): Promise<DomainConfig | null> {
    const domain = await this.db.domainConfig.findUnique({
      where: {
        tenantId_slug: { tenantId, slug },
      },
    });

    return domain ? this.mapToDomain(domain) : null;
  }

  /**
   * Get all active domains for a tenant
   */
  async getActiveDomains(tenantId: string): Promise<DomainConfig[]> {
    const domains = await this.db.domainConfig.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      orderBy: [
        { priority: 'desc' },
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    return domains.map(this.mapToDomain);
  }

  /**
   * Get all domains for a tenant (including inactive)
   */
  async getAllDomains(tenantId: string): Promise<DomainConfig[]> {
    const domains = await this.db.domainConfig.findMany({
      where: { tenantId },
      orderBy: [
        { status: 'asc' }, // ACTIVE first
        { priority: 'desc' },
        { name: 'asc' },
      ],
    });

    return domains.map(this.mapToDomain);
  }

  /**
   * Get the default domain for a tenant
   */
  async getDefaultDomain(tenantId: string): Promise<DomainConfig | null> {
    const domain = await this.db.domainConfig.findFirst({
      where: {
        tenantId,
        isDefault: true,
        status: 'ACTIVE',
      },
    });

    return domain ? this.mapToDomain(domain) : null;
  }

  /**
   * Update a domain configuration
   */
  async update(id: string, input: UpdateDomainConfigInput): Promise<DomainConfig> {
    const domain = await this.db.domainConfig.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.selectionRules !== undefined && { selectionRules: input.selectionRules }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
        ...(input.guidelinesId !== undefined && { guidelinesId: input.guidelinesId }),
        ...(input.criteriaId !== undefined && { criteriaId: input.criteriaId }),
        ...(input.configOverrides !== undefined && { configOverrides: input.configOverrides }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });

    return this.mapToDomain(domain);
  }

  /**
   * Set a domain as the default (and unset any existing default)
   */
  async setDefault(tenantId: string, domainId: string): Promise<void> {
    await this.db.$transaction([
      // Unset existing default
      this.db.domainConfig.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      }),
      // Set new default
      this.db.domainConfig.update({
        where: { id: domainId },
        data: { isDefault: true },
      }),
    ]);
  }

  /**
   * Archive a domain (soft delete)
   */
  async archive(id: string): Promise<void> {
    await this.db.domainConfig.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * Delete a domain permanently
   */
  async delete(id: string): Promise<void> {
    await this.db.domainConfig.delete({
      where: { id },
    });
  }

  // ===========================================================================
  // DOMAIN WITH RELATIONS
  // ===========================================================================

  /**
   * Get domain with its associated Guidelines and Criteria
   */
  async getDomainWithGC(id: string): Promise<{
    domain: DomainConfig;
    guidelines: { id: string; version: number } | null;
    criteria: { id: string; version: number } | null;
  } | null> {
    const domain = await this.db.domainConfig.findUnique({
      where: { id },
      include: {
        guidelines: { select: { id: true, version: true } },
        criteria: { select: { id: true, version: true } },
      },
    });

    if (!domain) return null;

    return {
      domain: this.mapToDomain(domain),
      guidelines: domain.guidelines,
      criteria: domain.criteria,
    };
  }

  // ===========================================================================
  // ANALYTICS QUERIES
  // ===========================================================================

  /**
   * Get task counts by domain for a tenant
   */
  async getTaskCountsByDomain(
    tenantId: string,
    since?: Date
  ): Promise<Array<{ domainId: string | null; domainName: string; count: number }>> {
    const results = await this.db.task.groupBy({
      by: ['domainId'],
      where: {
        tenantId,
        ...(since && { createdAt: { gte: since } }),
      },
      _count: { id: true },
    });

    // Get domain names
    const domainIds = results.map((r) => r.domainId).filter(Boolean) as string[];
    const domains = await this.db.domainConfig.findMany({
      where: { id: { in: domainIds } },
      select: { id: true, name: true },
    });

    const domainMap = new Map(domains.map((d) => [d.id, d.name]));

    return results.map((r) => ({
      domainId: r.domainId,
      domainName: r.domainId ? domainMap.get(r.domainId) || 'Unknown' : 'No Domain',
      count: r._count.id,
    }));
  }

  /**
   * Get inner loop stats by domain
   */
  async getInnerLoopStatsByDomain(
    tenantId: string,
    since?: Date
  ): Promise<
    Array<{
      domainId: string | null;
      domainName: string;
      totalRuns: number;
      convergedCount: number;
      avgIterations: number;
      avgFinalScore: number | null;
    }>
  > {
    const runs = await this.db.innerLoopRun.findMany({
      where: {
        tenantId,
        ...(since && { createdAt: { gte: since } }),
      },
      select: {
        domainId: true,
        converged: true,
        iterations: true,
        finalScore: true,
      },
    });

    // Group by domain
    const byDomain = new Map<string | null, typeof runs>();
    for (const run of runs) {
      const key = run.domainId;
      if (!byDomain.has(key)) byDomain.set(key, []);
      byDomain.get(key)!.push(run);
    }

    // Get domain names
    const domainIds = [...byDomain.keys()].filter(Boolean) as string[];
    const domains = await this.db.domainConfig.findMany({
      where: { id: { in: domainIds } },
      select: { id: true, name: true },
    });
    const domainMap = new Map(domains.map((d) => [d.id, d.name]));

    return Array.from(byDomain.entries()).map(([domainId, domainRuns]) => {
      const convergedRuns = domainRuns.filter((r) => r.converged);
      const scoresRuns = domainRuns.filter((r) => r.finalScore !== null);

      return {
        domainId,
        domainName: domainId ? domainMap.get(domainId) || 'Unknown' : 'No Domain',
        totalRuns: domainRuns.length,
        convergedCount: convergedRuns.length,
        avgIterations:
          domainRuns.reduce((sum, r) => sum + r.iterations, 0) / domainRuns.length || 0,
        avgFinalScore:
          scoresRuns.length > 0
            ? scoresRuns.reduce((sum, r) => sum + (r.finalScore || 0), 0) / scoresRuns.length
            : null,
      };
    });
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private mapToDomain(data: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    description: string | null;
    selectionRules: unknown;
    priority: number;
    isDefault: boolean;
    guidelinesId: string | null;
    criteriaId: string | null;
    configOverrides: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): DomainConfig {
    return {
      id: data.id,
      tenantId: data.tenantId,
      name: data.name,
      slug: data.slug,
      description: data.description || undefined,
      selectionRules: data.selectionRules as DomainSelectionRule[],
      priority: data.priority,
      isDefault: data.isDefault,
      guidelinesId: data.guidelinesId || undefined,
      criteriaId: data.criteriaId || undefined,
      configOverrides: data.configOverrides as DomainConfigOverrides,
      status: data.status as DomainStatus,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: DomainRepository | null = null;

export function getDomainRepository(): DomainRepository {
  if (!instance) {
    instance = new DomainRepository();
  }
  return instance;
}

export function resetDomainRepository(): void {
  instance = null;
}
