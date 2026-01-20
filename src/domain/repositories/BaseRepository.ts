/**
 * Base Repository - Common data access patterns
 *
 * Provides a consistent interface for database operations
 * with automatic tenant isolation via the tenant context.
 */

import type { PrismaClient } from '../../generated/prisma/index.js';
import { prisma } from '../../infrastructure/database/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryOptions {
  pagination?: PaginationParams;
  sort?: SortParams;
  include?: Record<string, boolean | object>;
}

// =============================================================================
// BASE REPOSITORY
// =============================================================================

export abstract class BaseRepository<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TWhereUniqueInput,
> {
  protected db: typeof prisma;
  protected abstract modelName: string;

  constructor() {
    // Use tenant-scoped prisma client
    this.db = prisma;
  }

  /**
   * Get the Prisma delegate for this model
   */
  protected abstract getDelegate(): {
    findUnique: (args: { where: TWhereUniqueInput; include?: object }) => Promise<TModel | null>;
    findFirst: (args: { where?: TWhereInput; include?: object }) => Promise<TModel | null>;
    findMany: (args: {
      where?: TWhereInput;
      include?: object;
      skip?: number;
      take?: number;
      orderBy?: object;
    }) => Promise<TModel[]>;
    create: (args: { data: TCreateInput; include?: object }) => Promise<TModel>;
    update: (args: {
      where: TWhereUniqueInput;
      data: TUpdateInput;
      include?: object;
    }) => Promise<TModel>;
    delete: (args: { where: TWhereUniqueInput }) => Promise<TModel>;
    count: (args: { where?: TWhereInput }) => Promise<number>;
  };

  /**
   * Find a single record by unique identifier
   */
  async findById(id: string, include?: object): Promise<TModel | null> {
    return this.getDelegate().findUnique({
      where: { id } as TWhereUniqueInput,
      include,
    });
  }

  /**
   * Find a single record by unique identifier (throws if not found)
   */
  async findByIdOrThrow(id: string, include?: object): Promise<TModel> {
    const result = await this.findById(id, include);
    if (!result) {
      throw new RepositoryError(`${this.modelName} not found: ${id}`, 'NOT_FOUND');
    }
    return result;
  }

  /**
   * Find the first record matching the filter
   */
  async findFirst(where: TWhereInput, include?: object): Promise<TModel | null> {
    return this.getDelegate().findFirst({ where, include });
  }

  /**
   * Find all records matching the filter
   */
  async findMany(where?: TWhereInput, options?: QueryOptions): Promise<TModel[]> {
    const args: {
      where?: TWhereInput;
      include?: object;
      skip?: number;
      take?: number;
      orderBy?: object;
    } = { where };

    if (options?.include) {
      args.include = options.include;
    }

    if (options?.pagination) {
      const { page = 1, pageSize = 20 } = options.pagination;
      args.skip = (page - 1) * pageSize;
      args.take = pageSize;
    }

    if (options?.sort) {
      args.orderBy = { [options.sort.field]: options.sort.direction };
    }

    return this.getDelegate().findMany(args);
  }

  /**
   * Find all records with pagination metadata
   */
  async findManyPaginated(
    where?: TWhereInput,
    options?: QueryOptions
  ): Promise<PaginatedResult<TModel>> {
    const { page = 1, pageSize = 20 } = options?.pagination || {};

    const [data, totalCount] = await Promise.all([
      this.findMany(where, options),
      this.count(where),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Create a new record
   */
  async create(data: TCreateInput, include?: object): Promise<TModel> {
    return this.getDelegate().create({ data, include });
  }

  /**
   * Update a record by ID
   */
  async update(id: string, data: TUpdateInput, include?: object): Promise<TModel> {
    return this.getDelegate().update({
      where: { id } as TWhereUniqueInput,
      data,
      include,
    });
  }

  /**
   * Delete a record by ID
   */
  async delete(id: string): Promise<TModel> {
    return this.getDelegate().delete({
      where: { id } as TWhereUniqueInput,
    });
  }

  /**
   * Count records matching the filter
   */
  async count(where?: TWhereInput): Promise<number> {
    return this.getDelegate().count({ where });
  }

  /**
   * Check if a record exists
   */
  async exists(where: TWhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }
}

// =============================================================================
// REPOSITORY ERROR
// =============================================================================

export type RepositoryErrorCode = 'NOT_FOUND' | 'DUPLICATE' | 'VALIDATION' | 'UNKNOWN';

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code: RepositoryErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

/**
 * Helper to create typed repository instances
 */
export function createRepository<T extends BaseRepository<unknown, unknown, unknown, unknown, unknown>>(
  RepositoryClass: new () => T
): T {
  return new RepositoryClass();
}
