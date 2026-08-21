/** Claims embedded in the signed access token. */
export interface AccessTokenPayload {
  /** Subject — the user id. */
  sub: string;
  email: string;
}

/** Claims embedded in the signed refresh token. */
export interface RefreshTokenPayload {
  sub: string;
  /** Monotonic version; a mismatch (post-logout) invalidates the token. */
  tokenVersion: number;
  /** Opaque per-token id, hashed and stored server-side for rotation. */
  jti: string;
}

/** Internal result of issuing a fresh token pair. */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  /** CSRF double-submit token issued alongside the session. */
  csrfToken: string;
}
