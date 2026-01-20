/**
 * Prisma Client - Database access with tenant isolation
 */

import { neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../generated/prisma/index.js';
import { createTenantExtension } from './TenantContext.js';

// =============================================================================
// NEON ADAPTER SETUP (Required for Prisma 7)
// =============================================================================

// Configure Neon for Node.js environment
neonConfig.webSocketConstructor = (await import('ws')).default;

// =============================================================================
// LAZY INITIALIZATION
// We use lazy initialization to ensure DATABASE_URL is available from dotenv
// =============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaNeon | undefined;
};

function getAdapter(): PrismaNeon {
  if (!globalForPrisma.adapter) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    // PrismaNeon takes PoolConfig, not Pool instance
    globalForPrisma.adapter = new PrismaNeon({ connectionString });
  }
  return globalForPrisma.adapter;
}

// =============================================================================
// PRISMA CLIENT SINGLETON
// =============================================================================

/**
 * Base Prisma client without tenant extension
 * Use this for operations that need to work across tenants
 * (e.g., looking up tenant by slug)
 */
function getPrismaBase(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ adapter: getAdapter() });
  }
  return globalForPrisma.prisma;
}

export const prismaBase = getPrismaBase();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaBase;
}

/**
 * Tenant-scoped Prisma client
 * Automatically filters all queries by the current tenant context
 */
export const prisma = prismaBase.$extends(createTenantExtension());

export type PrismaClientType = typeof prisma;

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

export async function connectDatabase(): Promise<void> {
  await prismaBase.$connect();
  console.log('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prismaBase.$disconnect();
  console.log('Database disconnected');
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prismaBase.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
