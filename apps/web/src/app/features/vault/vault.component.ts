import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, startWith } from 'rxjs';
import { NotesService } from '../../core/notes.service';
import { extractErrorMessage } from '../../core/http-error';
import type { CreateNotePayload, Note } from '../../core/models';
import { NoteEditorComponent } from './note-editor.component';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'sv-vault',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NoteEditorComponent],
  templateUrl: './vault.component.html',
  styleUrls: ['./vault.component.css'],
})
export class VaultComponent {
  private readonly notesService = inject(NotesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<Note | null>(null);

  protected readonly activeTag = signal<string | null>(null);

  protected readonly search = new FormControl<string>('', { nonNullable: true });
  private readonly searchValue = toSignal(
    this.search.valueChanges.pipe(debounceTime(180), startWith('')),
    { initialValue: '' },
  );

  protected readonly allTags = this.notesService.allTags;

  /** Client-side filtered view over the loaded notes. */
  protected readonly visibleNotes = computed<Note[]>(() => {
    const term = this.searchValue().trim().toLowerCase();
    const tag = this.activeTag();
    return this.notesService.notes().filter((note) => {
      const matchesTag = !tag || note.tags.includes(tag);
      const matchesTerm =
        !term ||
        note.title.toLowerCase().includes(term) ||
        note.content.toLowerCase().includes(term) ||
        note.tags.some((t) => t.includes(term));
      return matchesTag && matchesTerm;
    });
  });

  protected readonly totalCount = computed(() => this.notesService.notes().length);

  /** Placeholder cards shown while notes load. */
  protected readonly skeletons = [0, 1, 2, 3];

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.state.set('loading');
    this.errorMsg.set(null);
    this.notesService.load().subscribe({
      next: () => this.state.set('ready'),
      error: (err: unknown) => {
        this.errorMsg.set(extractErrorMessage(err));
        this.state.set('error');
      },
    });
  }

  protected toggleTag(tag: string): void {
    this.activeTag.update((current) => (current === tag ? null : tag));
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.editorOpen.set(true);
  }

  protected openEdit(note: Note): void {
    this.editing.set(note);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editing.set(null);
  }

  protected handleSave(payload: CreateNotePayload): void {
    this.saving.set(true);
    const current = this.editing();
    const request$ = current
      ? this.notesService.update(current.id, payload)
      : this.notesService.create(payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeEditor();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMsg.set(extractErrorMessage(err));
      },
    });
  }

  protected deleteNote(note: Note, event: MouseEvent): void {
    event.stopPropagation();
    if (!confirm(`Delete "${note.title}"? This cannot be undone.`)) {
      return;
    }
    this.notesService.remove(note.id).subscribe({
      error: (err: unknown) => this.errorMsg.set(extractErrorMessage(err)),
    });
  }

  protected preview(content: string): string {
    const trimmed = content.trim();
    return trimmed.length > 180 ? `${trimmed.slice(0, 180)}…` : trimmed;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
