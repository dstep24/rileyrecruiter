/**
 * Prisma Client - Database access with tenant isolation
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../generated/prisma/index.js';
import { createTenantExtension } from './TenantContext.js';

// =============================================================================
// NEON ADAPTER SETUP (Required for Prisma 7)
// =============================================================================

// Configure Neon for Node.js environment
neonConfig.webSocketConstructor = (await import('ws')).default;

// Create connection pool
const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });

// Create Prisma adapter
const adapter = new PrismaNeon(pool);

// =============================================================================
// PRISMA CLIENT SINGLETON
// =============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Base Prisma client without tenant extension
 * Use this for operations that need to work across tenants
 * (e.g., looking up tenant by slug)
 */
export const prismaBase = globalForPrisma.prisma ?? new PrismaClient({ adapter });

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
