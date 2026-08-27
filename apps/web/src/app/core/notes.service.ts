import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  CreateNoteRequest,
  Note,
  UpdateNoteRequest,
} from '@secure-vault/shared-types';

/**
 * Notes state + API access. Holds the loaded notes in a signal so components
 * render reactively. Mutations update the local signal optimistically where it
 * improves UX (create/update/delete), reconciling with the server response.
 */
@Injectable({ providedIn: 'root' })
export class NotesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/notes`;

  private readonly _notes = signal<Note[]>([]);
  readonly notes = this._notes.asReadonly();

  /** All distinct tags across the loaded notes (for the tag filter bar). */
  readonly allTags = computed(() => {
    const set = new Set<string>();
    for (const note of this._notes()) {
      for (const tag of note.tags) {
        set.add(tag);
      }
    }
    return Array.from(set).sort();
  });

  load(): Observable<Note[]> {
    return this.http
      .get<Note[]>(this.base)
      .pipe(tap((notes) => this._notes.set(notes)));
  }

  create(payload: CreateNoteRequest): Observable<Note> {
    return this.http.post<Note>(this.base, payload).pipe(
      tap((created) => this._notes.update((list) => [created, ...list])),
    );
  }

  update(id: string, payload: UpdateNoteRequest): Observable<Note> {
    return this.http.patch<Note>(`${this.base}/${id}`, payload).pipe(
      tap((updated) =>
        this._notes.update((list) =>
          list.map((n) => (n.id === id ? updated : n)),
        ),
      ),
    );
  }

  remove(id: string): Observable<void> {
    // Optimistic removal; restored by a fresh load on error at the caller.
    const previous = this._notes();
    this._notes.update((list) => list.filter((n) => n.id !== id));
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap({
        error: () => this._notes.set(previous),
      }),
    );
  }

  clear(): void {
    this._notes.set([]);
  }
}
