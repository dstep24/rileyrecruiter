/**
 * Criteria Repository - Data access for Criteria (C)
 *
 * Handles CRUD operations and versioning for Criteria.
 * Criteria encode "what good recruiting looks like" and are used by the inner loop
 * to evaluate generated outputs.
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type { Criteria, Prisma } from '../../generated/prisma/index.js';
import { BaseRepository, RepositoryError } from './BaseRepository.js';

// =============================================================================
// TYPES
// =============================================================================

export type CriteriaCreateInput = Prisma.CriteriaCreateInput;
export type CriteriaUpdateInput = Prisma.CriteriaUpdateInput;
export type CriteriaWhereInput = Prisma.CriteriaWhereInput;
export type CriteriaWhereUniqueInput = Prisma.CriteriaWhereUniqueInput;

// =============================================================================
// REPOSITORY
// =============================================================================

export class CriteriaRepository extends BaseRepository<
  Criteria,
  CriteriaCreateInput,
  CriteriaUpdateInput,
  CriteriaWhereInput,
  CriteriaWhereUniqueInput
> {
  protected modelName = 'Criteria';

  protected getDelegate() {
    return this.db.criteria;
  }

  /**
   * Get the active criteria for a tenant
   */
  async getActive(tenantId: string): Promise<Criteria | null> {
    return this.db.criteria.findFirst({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      orderBy: {
        version: 'desc',
      },
    });
  }

  /**
   * Get the active criteria (throws if not found)
   */
  async getActiveOrThrow(tenantId: string): Promise<Criteria> {
    const criteria = await this.getActive(tenantId);
    if (!criteria) {
      throw new RepositoryError(
        `No active criteria found for tenant: ${tenantId}`,
        'NOT_FOUND'
      );
    }
    return criteria;
  }

  /**
   * Get criteria by ID
   */
  async getById(id: string): Promise<Criteria | null> {
    return this.db.criteria.findUnique({
      where: { id },
    });
  }

  /**
   * Get a specific version of criteria
   */
  async getVersion(tenantId: string, version: number): Promise<Criteria | null> {
    return this.db.criteria.findUnique({
      where: {
        tenantId_version: { tenantId, version },
      },
    });
  }

  /**
   * Get all versions of criteria for a tenant
   */
  async getAllVersions(tenantId: string): Promise<Criteria[]> {
    return this.db.criteria.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Get the latest version number for a tenant
   */
  async getLatestVersionNumber(tenantId: string): Promise<number> {
    const latest = await this.db.criteria.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version ?? 0;
  }

  /**
   * Create a new draft version of criteria
   */
  async createDraft(
    tenantId: string,
    data: {
      qualityStandards?: Prisma.InputJsonValue;
      evaluationRubrics?: Prisma.InputJsonValue;
      successMetrics?: Prisma.InputJsonValue;
      failurePatterns?: Prisma.InputJsonValue;
      createdBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
      changelog?: string;
    }
  ): Promise<Criteria> {
    const latestVersion = await this.getLatestVersionNumber(tenantId);
    const active = await this.getActive(tenantId);

    return this.db.criteria.create({
      data: {
        tenantId,
        version: latestVersion + 1,
        status: 'DRAFT',
        qualityStandards: data.qualityStandards ?? active?.qualityStandards ?? [],
        evaluationRubrics: data.evaluationRubrics ?? active?.evaluationRubrics ?? [],
        successMetrics: data.successMetrics ?? active?.successMetrics ?? [],
        failurePatterns: data.failurePatterns ?? active?.failurePatterns ?? [],
        createdBy: data.createdBy,
        parentVersionId: active?.id,
        changelog: data.changelog,
      },
    });
  }

  /**
   * Activate a draft version (makes it the current active version)
   */
  async activateDraft(
    criteriaId: string,
    effectiveFrom: Date = new Date()
  ): Promise<Criteria> {
    // Get the draft
    const draft = await this.findByIdOrThrow(criteriaId);

    if (draft.status !== 'DRAFT') {
      throw new RepositoryError(
        `Criteria ${criteriaId} is not a draft`,
        'VALIDATION'
      );
    }

    // Deactivate the current active version
    const currentActive = await this.getActive(draft.tenantId);
    if (currentActive) {
      await this.db.criteria.update({
        where: { id: currentActive.id },
        data: {
          status: 'ARCHIVED',
          effectiveUntil: effectiveFrom,
        },
      });
    }

    // Activate the draft
    return this.db.criteria.update({
      where: { id: criteriaId },
      data: {
        status: 'ACTIVE',
        effectiveFrom,
      },
    });
  }

  /**
   * Reject a draft version
   */
  async rejectDraft(criteriaId: string, reason?: string): Promise<Criteria> {
    const draft = await this.findByIdOrThrow(criteriaId);

    if (draft.status !== 'DRAFT') {
      throw new RepositoryError(
        `Criteria ${criteriaId} is not a draft`,
        'VALIDATION'
      );
    }

    return this.db.criteria.update({
      where: { id: criteriaId },
      data: {
        status: 'REJECTED',
        changelog: reason
          ? `${draft.changelog || ''}\nRejection reason: ${reason}`
          : draft.changelog,
      },
    });
  }

  /**
   * Get draft versions awaiting review
   */
  async getDrafts(tenantId: string): Promise<Criteria[]> {
    return this.db.criteria.findMany({
      where: {
        tenantId,
        status: 'DRAFT',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Compare two versions of criteria
   */
  async compareVersions(
    tenantId: string,
    versionA: number,
    versionB: number
  ): Promise<{ a: Criteria; b: Criteria }> {
    const [a, b] = await Promise.all([
      this.getVersion(tenantId, versionA),
      this.getVersion(tenantId, versionB),
    ]);

    if (!a || !b) {
      throw new RepositoryError(
        `One or both versions not found: ${versionA}, ${versionB}`,
        'NOT_FOUND'
      );
    }

    return { a, b };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: CriteriaRepository | null = null;

export function getCriteriaRepository(): CriteriaRepository {
  if (!instance) {
    instance = new CriteriaRepository();
  }
  return instance;
}
