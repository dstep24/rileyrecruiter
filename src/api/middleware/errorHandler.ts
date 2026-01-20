/**
 * Error Handler Middleware
 *
 * Centralized error handling for the API.
 */

import type { Request, Response, NextFunction } from 'express';
import { RepositoryError } from '../../domain/repositories/BaseRepository.js';
import { TenantContextError } from '../../infrastructure/database/TenantContext.js';

// =============================================================================
// ERROR TYPES
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404,
      'NOT_FOUND',
      { resource, id }
    );
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

// =============================================================================
// ERROR RESPONSE TYPE
// =============================================================================

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

// =============================================================================
// ERROR HANDLER MIDDLEWARE
// =============================================================================

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  console.error('API Error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Get request ID for tracking
  const requestId = req.headers['x-request-id'] as string | undefined;

  // Handle known error types
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  if (err instanceof RepositoryError) {
    const statusCode =
      err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'DUPLICATE'
          ? 409
          : err.code === 'VALIDATION'
            ? 422
            : 500;

    res.status(statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  if (err instanceof TenantContextError) {
    res.status(400).json({
      error: {
        message: err.message,
        code: 'TENANT_CONTEXT_ERROR',
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as { code?: string; meta?: Record<string, unknown> };

    if (prismaError.code === 'P2002') {
      res.status(409).json({
        error: {
          message: 'Duplicate record',
          code: 'DUPLICATE',
          details: prismaError.meta,
          requestId,
        },
      } satisfies ErrorResponse);
      return;
    }

    if (prismaError.code === 'P2025') {
      res.status(404).json({
        error: {
          message: 'Record not found',
          code: 'NOT_FOUND',
          requestId,
        },
      } satisfies ErrorResponse);
      return;
    }
  }

  // Handle validation errors (e.g., from Zod)
  if (err.name === 'ZodError') {
    const zodError = err as { errors?: unknown[] };
    res.status(422).json({
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: { errors: zodError.errors },
        requestId,
      },
    } satisfies ErrorResponse);
    return;
  }

  // Default to internal server error
  res.status(500).json({
    error: {
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err.message,
      code: 'INTERNAL_ERROR',
      requestId,
    },
  } satisfies ErrorResponse);
}

// =============================================================================
// NOT FOUND HANDLER
// =============================================================================

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'ROUTE_NOT_FOUND',
      requestId: req.headers['x-request-id'] as string,
    },
  } satisfies ErrorResponse);
}
