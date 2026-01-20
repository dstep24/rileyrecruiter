/**
 * Guidelines Repository - Data access for Guidelines (G)
 *
 * Handles CRUD operations and versioning for Guidelines.
 * Guidelines encode "how to recruit" and can be updated by the inner loop.
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type { Guidelines, Prisma } from '../../generated/prisma/index.js';
import { BaseRepository, RepositoryError } from './BaseRepository.js';

// =============================================================================
// TYPES
// =============================================================================

export type GuidelinesCreateInput = Prisma.GuidelinesCreateInput;
export type GuidelinesUpdateInput = Prisma.GuidelinesUpdateInput;
export type GuidelinesWhereInput = Prisma.GuidelinesWhereInput;
export type GuidelinesWhereUniqueInput = Prisma.GuidelinesWhereUniqueInput;

// =============================================================================
// REPOSITORY
// =============================================================================

export class GuidelinesRepository extends BaseRepository<
  Guidelines,
  GuidelinesCreateInput,
  GuidelinesUpdateInput,
  GuidelinesWhereInput,
  GuidelinesWhereUniqueInput
> {
  protected modelName = 'Guidelines';

  protected getDelegate() {
    return this.db.guidelines;
  }

  /**
   * Get the active guidelines for a tenant
   */
  async getActive(tenantId: string): Promise<Guidelines | null> {
    return this.db.guidelines.findFirst({
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
   * Get the active guidelines (throws if not found)
   */
  async getActiveOrThrow(tenantId: string): Promise<Guidelines> {
    const guidelines = await this.getActive(tenantId);
    if (!guidelines) {
      throw new RepositoryError(
        `No active guidelines found for tenant: ${tenantId}`,
        'NOT_FOUND'
      );
    }
    return guidelines;
  }

  /**
   * Get a specific version of guidelines
   */
  async getVersion(tenantId: string, version: number): Promise<Guidelines | null> {
    return this.db.guidelines.findUnique({
      where: {
        tenantId_version: { tenantId, version },
      },
    });
  }

  /**
   * Get all versions of guidelines for a tenant
   */
  async getAllVersions(tenantId: string): Promise<Guidelines[]> {
    return this.db.guidelines.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Get the latest version number for a tenant
   */
  async getLatestVersionNumber(tenantId: string): Promise<number> {
    const latest = await this.db.guidelines.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version ?? 0;
  }

  /**
   * Create a new draft version of guidelines
   * (Used by inner loop when learning)
   */
  async createDraft(
    tenantId: string,
    data: {
      workflows?: Prisma.InputJsonValue;
      templates?: Prisma.InputJsonValue;
      decisionTrees?: Prisma.InputJsonValue;
      constraints?: Prisma.InputJsonValue;
      createdBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
      changelog?: string;
    }
  ): Promise<Guidelines> {
    const latestVersion = await this.getLatestVersionNumber(tenantId);
    const active = await this.getActive(tenantId);

    return this.db.guidelines.create({
      data: {
        tenantId,
        version: latestVersion + 1,
        status: 'DRAFT',
        workflows: data.workflows ?? active?.workflows ?? [],
        templates: data.templates ?? active?.templates ?? [],
        decisionTrees: data.decisionTrees ?? active?.decisionTrees ?? [],
        constraints: data.constraints ?? active?.constraints ?? [],
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
    guidelinesId: string,
    effectiveFrom: Date = new Date()
  ): Promise<Guidelines> {
    // Get the draft
    const draft = await this.findByIdOrThrow(guidelinesId);

    if (draft.status !== 'DRAFT') {
      throw new RepositoryError(
        `Guidelines ${guidelinesId} is not a draft`,
        'VALIDATION'
      );
    }

    // Deactivate the current active version
    const currentActive = await this.getActive(draft.tenantId);
    if (currentActive) {
      await this.db.guidelines.update({
        where: { id: currentActive.id },
        data: {
          status: 'ARCHIVED',
          effectiveUntil: effectiveFrom,
        },
      });
    }

    // Activate the draft
    return this.db.guidelines.update({
      where: { id: guidelinesId },
      data: {
        status: 'ACTIVE',
        effectiveFrom,
      },
    });
  }

  /**
   * Reject a draft version
   */
  async rejectDraft(guidelinesId: string, reason?: string): Promise<Guidelines> {
    const draft = await this.findByIdOrThrow(guidelinesId);

    if (draft.status !== 'DRAFT') {
      throw new RepositoryError(
        `Guidelines ${guidelinesId} is not a draft`,
        'VALIDATION'
      );
    }

    return this.db.guidelines.update({
      where: { id: guidelinesId },
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
  async getDrafts(tenantId: string): Promise<Guidelines[]> {
    return this.db.guidelines.findMany({
      where: {
        tenantId,
        status: 'DRAFT',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Compare two versions of guidelines
   */
  async compareVersions(
    tenantId: string,
    versionA: number,
    versionB: number
  ): Promise<{ a: Guidelines; b: Guidelines }> {
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

let instance: GuidelinesRepository | null = null;

export function getGuidelinesRepository(): GuidelinesRepository {
  if (!instance) {
    instance = new GuidelinesRepository();
  }
  return instance;
}
