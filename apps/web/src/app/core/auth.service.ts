import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AuthResponse, AuthUser } from '@secure-vault/shared-types';

/**
 * Authentication state, backed by Angular signals.
 *
 * Security notes:
 *  - The access token lives ONLY in memory (a signal), never in
 *    localStorage/sessionStorage, so it is not exposed to XSS-persisted theft.
 *  - The refresh token is an httpOnly cookie the JS never touches.
 *  - The CSRF token is read from a readable cookie and attached by the
 *    interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);
  /** Becomes true once the initial silent-refresh attempt has resolved. */
  private readonly _initialized = signal(false);

  readonly user = this._user.asReadonly();
  readonly initialized = this._initialized.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  get accessToken(): string | null {
    return this._accessToken();
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register`, { email, password })
      .pipe(tap((res) => this.setSession(res)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/login`, { email, password })
      .pipe(tap((res) => this.setSession(res)));
  }

  /** Rotates the refresh cookie into a fresh access token. */
  refresh(): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(`${this.base}/auth/refresh`, {})
      .pipe(tap((res) => this._accessToken.set(res.accessToken)));
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.base}/auth/logout`, {})
      .pipe(tap(() => this.clearSession()));
  }

  loadProfile(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.base}/auth/me`)
      .pipe(tap((user) => this._user.set(user)));
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }

  markInitialized(): void {
    this._initialized.set(true);
  }

  private setSession(res: AuthResponse): void {
    this._accessToken.set(res.accessToken);
    this._user.set(res.user);
  }
}
