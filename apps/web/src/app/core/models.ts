/** Transport shapes shared with the API (kept in sync with @secure-vault/shared-types). */

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotePayload {
  title: string;
  content: string;
  tags?: string[];
}

export type UpdateNotePayload = Partial<CreateNotePayload>;

export interface ApiError {
  statusCode: number;
  message: string;
  error: string;
}
