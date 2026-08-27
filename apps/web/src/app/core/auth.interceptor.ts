import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  catchError,
  filter,
  finalize,
  switchMap,
  take,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Reads a cookie value by name (used for the CSRF double-submit token). */
function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Endpoints that must never trigger the refresh-retry loop. */
function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh')
  );
}

/**
 * Outcome of the single in-flight refresh. The failure case has to travel too:
 * queued requests wait on this subject, so if only the token were published a
 * failed refresh would leave them pending forever.
 */
type RefreshOutcome = { token: string } | { error: unknown };

// Shared refresh state so concurrent 401s wait on a single refresh call.
let isRefreshing = false;
const refreshComplete$ = new BehaviorSubject<RefreshOutcome | null>(null);

/**
 * Functional HTTP interceptor:
 *  - sends cookies (`withCredentials`) for the refresh/CSRF flow,
 *  - attaches the in-memory access token as a Bearer header,
 *  - attaches the CSRF token header for state-changing requests,
 *  - on a 401, silently refreshes once and replays the request.
 */
export function authInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const auth = inject(AuthService);

  const authReq = decorate(req, auth.accessToken);

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isAuthEndpoint(req.url)
      ) {
        return handle401(authReq, next, auth);
      }
      return throwError(() => error);
    }),
  );
}

function decorate(
  req: HttpRequest<unknown>,
  token: string | null,
): HttpRequest<unknown> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const csrf = readCookie(environment.csrfCookieName);
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (csrf && mutating) {
    headers['X-CSRF-Token'] = csrf;
  }
  return req.clone({ setHeaders: headers, withCredentials: true });
}

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
): Observable<HttpEvent<unknown>> {
  if (isRefreshing) {
    // Queue behind the in-flight refresh, then replay with the new token — or
    // surface the refresh error if it failed.
    return refreshComplete$.pipe(
      filter((outcome): outcome is RefreshOutcome => outcome !== null),
      take(1),
      switchMap((outcome) =>
        'token' in outcome
          ? next(decorate(req, outcome.token))
          : throwError(() => outcome.error),
      ),
    );
  }

  isRefreshing = true;
  refreshComplete$.next(null);

  return auth.refresh().pipe(
    switchMap((res) => {
      refreshComplete$.next({ token: res.accessToken });
      return next(decorate(req, res.accessToken));
    }),
    catchError((err: unknown) => {
      // `null` still in the subject means the refresh itself failed and nothing
      // was published for this round; anything else means the token already
      // went out and this error came from the replayed request.
      if (refreshComplete$.value === null) {
        refreshComplete$.next({ error: err });
      }
      auth.clearSession();
      return throwError(() => err);
    }),
    finalize(() => {
      isRefreshing = false;
    }),
  );
}
