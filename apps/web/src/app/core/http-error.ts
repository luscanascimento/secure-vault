import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a human-friendly message from an API error without leaking internals.
 * Falls back to a generic message for unexpected shapes.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: unknown } | null;
    if (body && typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection.';
    }
    if (error.status === 429) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Remediation hints the API may attach to a 4xx (password-strength advice).
 * Returns an empty array for any other shape.
 */
export function extractErrorSuggestions(error: unknown): string[] {
  if (!(error instanceof HttpErrorResponse)) {
    return [];
  }
  const body = error.error as { suggestions?: unknown } | null;
  if (!Array.isArray(body?.suggestions)) {
    return [];
  }
  return body.suggestions.filter((s): s is string => typeof s === 'string');
}
