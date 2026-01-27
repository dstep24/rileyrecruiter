/**
 * Tenant Context - Multi-tenant isolation
 *
 * Manages tenant context throughout request lifecycle.
 * Implements Row-Level Security (RLS) patterns for data isolation.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// =============================================================================
// TENANT CONTEXT TYPE
// =============================================================================

export interface TenantContextData {
  tenantId: string;
  tenantSlug?: string;
  userId?: string;
  userRole?: string;
  requestId?: string;
}

// =============================================================================
// ASYNC LOCAL STORAGE
// =============================================================================

const tenantStorage = new AsyncLocalStorage<TenantContextData>();

/**
 * Run a function within a tenant context
 */
export function withTenantContext<T>(context: TenantContextData, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

/**
 * Run an async function within a tenant context
 */
export async function withTenantContextAsync<T>(
  context: TenantContextData,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run(context, fn);
}

/**
 * Get the current tenant context
 */
export function getTenantContext(): TenantContextData | undefined {
  return tenantStorage.getStore();
}

/**
 * Get the current tenant ID (throws if not set)
 */
export function requireTenantId(): string {
  const context = getTenantContext();
  if (!context?.tenantId) {
    throw new TenantContextError('Tenant context not set');
  }
  return context.tenantId;
}

/**
 * Get the current tenant ID (returns undefined if not set)
 */
export function getTenantId(): string | undefined {
  return getTenantContext()?.tenantId;
}

// =============================================================================
// ERRORS
// =============================================================================

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

// =============================================================================
// PRISMA EXTENSION FOR RLS
// =============================================================================

/**
 * Prisma extension that automatically filters queries by tenant
 *
 * Usage:
 * const prisma = new PrismaClient().$extends(tenantExtension);
 */
// Models that do NOT have a tenantId column and should be excluded
// from automatic tenant filtering/injection
const MODELS_WITHOUT_TENANT_ID = new Set([
  'Tenant',
  'Message',
  'Assessment',
  'Interaction',
  'RileyConversation',
  'RileyMessage',
  'PreScreeningQuestion',
  'PreScreeningResponse',
  'PreScreeningAnswer',
]);

export const createTenantExtension = () => ({
  name: 'tenant-extension',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: {
        model: string;
        operation: string;
        args: Record<string, unknown>;
        query: (args: Record<string, unknown>) => Promise<unknown>;
      }) {
        // Skip tenant filtering for models without tenantId column
        if (MODELS_WITHOUT_TENANT_ID.has(model)) {
          return query(args);
        }

        // Skip for operations that don't support where clause
        const operationsWithWhere = [
          'findUnique',
          'findFirst',
          'findMany',
          'update',
          'updateMany',
          'delete',
          'deleteMany',
          'count',
          'aggregate',
        ];

        const tenantId = getTenantId();

        // Only add tenant filter if we have a tenant context
        if (tenantId && operationsWithWhere.includes(operation)) {
          const where = (args.where || {}) as Record<string, unknown>;
          args.where = { ...where, tenantId };
        }

        // For create operations, add tenantId if not present
        if (tenantId && operation === 'create') {
          const data = (args.data || {}) as Record<string, unknown>;
          if (!data.tenantId) {
            args.data = { ...data, tenantId };
          }
        }

        // For createMany, add tenantId to each record
        if (tenantId && operation === 'createMany') {
          const data = args.data as Record<string, unknown>[];
          if (Array.isArray(data)) {
            args.data = data.map((record) => ({
              ...record,
              tenantId: record.tenantId || tenantId,
            }));
          }
        }

        return query(args);
      },
    },
  },
});

// =============================================================================
// MIDDLEWARE HELPERS
// =============================================================================

/**
 * Extract tenant from subdomain
 * e.g., acme.riley.app -> acme
 */
export function extractTenantFromHost(host: string): string | null {
  const parts = host.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}

/**
 * Extract tenant from path
 * e.g., /tenants/acme/candidates -> acme
 */
export function extractTenantFromPath(path: string): string | null {
  const match = path.match(/^\/tenants\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Extract tenant from header
 */
export function extractTenantFromHeader(
  headers: Record<string, string | string[] | undefined>,
  headerName = 'x-tenant-id'
): string | null {
  const value = headers[headerName];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }
  return null;
}
