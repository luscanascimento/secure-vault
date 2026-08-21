/**
 * Shared TypeScript contracts between the NestJS API and the Angular web app.
 * These are transport-shape types only — no runtime logic — so both ends stay
 * in sync without duplicating interfaces.
 */

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export type LoginRequest = RegisterRequest;

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  tags?: string[];
}

export type UpdateNoteRequest = Partial<CreateNoteRequest>;

export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}
