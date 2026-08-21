import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
  /** Optional remediation hints (e.g. password-strength suggestions). */
  suggestions?: string[];
}

/**
 * Global exception filter — the single place that shapes error responses.
 *
 * Security posture: it NEVER leaks stack traces, ORM errors or internal detail
 * to clients. Known HttpExceptions surface their (safe) message; anything else
 * is logged server-side and returned as a generic 500. Full detail stays in the
 * structured logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message, suggestions } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${status} ${error} on ${request.method} ${request.url}: ${message}`,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(suggestions ? { suggestions } : {}),
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    error: string;
    message: string;
    suggestions?: string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string;

      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object' && 'message' in res) {
        const raw = (res as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join('; ') : String(raw);
      } else {
        message = exception.message;
      }

      return {
        status,
        // The concrete subclass (NotFoundException -> "NotFound"), not the base
        // class — `HttpException.name` is static and would label everything
        // "Http".
        error: exception.constructor.name.replace('Exception', ''),
        message,
        suggestions: this.extractSuggestions(res),
      };
    }

    // Unknown / non-HTTP error — do not expose internals.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    };
  }

  /**
   * Carries `suggestions` through to the client when a thrower supplied them
   * (password-strength advice). Only a plain array of strings is forwarded, so
   * an accidental object can never leak internals.
   */
  private extractSuggestions(res: unknown): string[] | undefined {
    if (!res || typeof res !== 'object' || !('suggestions' in res)) {
      return undefined;
    }
    const raw = (res as { suggestions: unknown }).suggestions;
    if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string')) {
      return undefined;
    }
    return raw.length > 0 ? (raw as string[]) : undefined;
  }
}
