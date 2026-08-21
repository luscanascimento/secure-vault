import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { CreateNotePayload, Note, UpdateNotePayload } from './models';

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

  search(term: string, tag: string | null): Observable<Note[]> {
    let params = new HttpParams();
    if (term) {
      params = params.set('search', term);
    }
    if (tag) {
      params = params.set('tag', tag);
    }
    return this.http
      .get<Note[]>(this.base, { params })
      .pipe(tap((notes) => this._notes.set(notes)));
  }

  create(payload: CreateNotePayload): Observable<Note> {
    return this.http.post<Note>(this.base, payload).pipe(
      tap((created) => this._notes.update((list) => [created, ...list])),
    );
  }

  update(id: string, payload: UpdateNotePayload): Observable<Note> {
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
