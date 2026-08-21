/**
 * Runtime configuration for the web app. `apiBaseUrl` points at the NestJS API.
 * All routes are served under `/api/v1`.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
  csrfCookieName: 'sv_csrf',
} as const;
