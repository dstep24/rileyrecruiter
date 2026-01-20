/**
 * Tenant Middleware - Extract and validate tenant context
 *
 * Extracts tenant identifier from request and sets up
 * the async local storage context for data isolation.
 */

import type { Request, Response, NextFunction } from 'express';
import { prismaBase } from '../../infrastructure/database/prisma.js';
import {
  withTenantContext,
  extractTenantFromHeader,
  extractTenantFromPath,
  type TenantContextData,
} from '../../infrastructure/database/TenantContext.js';

// =============================================================================
// MIDDLEWARE
// =============================================================================

export interface TenantMiddlewareOptions {
  headerName?: string;
  allowPathExtraction?: boolean;
  requireTenant?: boolean;
}

const DEFAULT_OPTIONS: TenantMiddlewareOptions = {
  headerName: 'x-tenant-id',
  allowPathExtraction: true,
  requireTenant: true,
};

// Default development tenant - used when no tenant is provided in development mode
const DEFAULT_DEV_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'development';

/**
 * Middleware that extracts tenant from request and sets context
 */
export function tenantMiddleware(options: TenantMiddlewareOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract tenant identifier
      let tenantSlug: string | null = null;

      // Try header first
      tenantSlug = extractTenantFromHeader(
        req.headers as Record<string, string | string[] | undefined>,
        opts.headerName
      );

      // Try path if allowed and header not found
      if (!tenantSlug && opts.allowPathExtraction) {
        tenantSlug = extractTenantFromPath(req.path);
      }

      // Check if tenant is required
      if (!tenantSlug && opts.requireTenant) {
        // In development mode, use default tenant if available
        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev && DEFAULT_DEV_TENANT_SLUG) {
          tenantSlug = DEFAULT_DEV_TENANT_SLUG;
          console.log(`[Tenant] Using default development tenant: ${tenantSlug}`);
        } else {
          res.status(400).json({
            error: 'Tenant identifier required',
            code: 'TENANT_REQUIRED',
          });
          return;
        }
      }

      // If no tenant (and not required), proceed without context
      if (!tenantSlug) {
        next();
        return;
      }

      const isDev = process.env.NODE_ENV !== 'production';
      const skipDbValidation = isDev && process.env.SKIP_DB_VALIDATION === 'true';

      let tenantId = tenantSlug;
      let tenantStatus: string = 'AUTONOMOUS';

      // In development without DB, skip database validation
      if (skipDbValidation) {
        console.log(`[Tenant] Skipping DB validation in dev mode for: ${tenantSlug}`);
      } else {
        // Look up tenant by slug or ID
        try {
          const tenant = await prismaBase.tenant.findFirst({
            where: {
              OR: [{ slug: tenantSlug }, { id: tenantSlug }],
            },
            select: { id: true, slug: true, status: true },
          });

          if (!tenant) {
            // In development mode, create a virtual tenant context
            if (isDev) {
              console.log(`[Tenant] Tenant not found in DB, using virtual context: ${tenantSlug}`);
            } else {
              res.status(404).json({
                error: `Tenant not found: ${tenantSlug}`,
                code: 'TENANT_NOT_FOUND',
              });
              return;
            }
          } else {
            tenantId = tenant.id;
            tenantSlug = tenant.slug;
            tenantStatus = tenant.status;
          }
        } catch (dbError) {
          // Database connection failed - in dev mode, continue with virtual tenant
          if (isDev) {
            console.warn(`[Tenant] Database unavailable, using virtual context: ${tenantSlug}`);
          } else {
            throw dbError;
          }
        }
      }

      // Check tenant status (skip for virtual tenants)
      if (tenantStatus === 'PAUSED') {
        res.status(403).json({
          error: 'Tenant is paused',
          code: 'TENANT_PAUSED',
        });
        return;
      }

      // Create context
      const context: TenantContextData = {
        tenantId,
        tenantSlug: tenantSlug!,
        requestId: req.headers['x-request-id'] as string,
      };

      // Attach to request for convenience
      (req as RequestWithTenant).tenant = context;

      // Run the rest of the request in tenant context
      withTenantContext(context, () => {
        next();
      });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware for routes that don't require tenant context
 */
export function optionalTenantMiddleware() {
  return tenantMiddleware({ requireTenant: false });
}

// =============================================================================
// TYPES
// =============================================================================

export interface RequestWithTenant extends Request {
  tenant?: TenantContextData;
}

// =============================================================================
// HELPER TO GET TENANT FROM REQUEST
// =============================================================================

export function getTenantFromRequest(req: Request): TenantContextData {
  const tenant = (req as RequestWithTenant).tenant;
  if (!tenant) {
    throw new Error('Tenant context not set on request');
  }
  return tenant;
}

export function getTenantIdFromRequest(req: Request): string {
  return getTenantFromRequest(req).tenantId;
}
