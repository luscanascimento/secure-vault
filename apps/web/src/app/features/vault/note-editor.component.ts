import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import type { CreateNoteRequest, Note } from '@secure-vault/shared-types';

/**
 * Slide-over editor for creating or editing a note. Emits a typed payload; the
 * parent owns persistence. Tags are entered as a comma/enter separated list and
 * rendered as removable chips (bound via Angular templating — no innerHTML).
 */
@Component({
  selector: 'sv-note-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './note-editor.component.html',
  styleUrls: ['./note-editor.component.css'],
})
export class NoteEditorComponent {
  private readonly fb = inject(FormBuilder);

  readonly note = input<Note | null>(null);
  readonly saving = input<boolean>(false);

  readonly save = output<CreateNoteRequest>();
  readonly cancel = output<void>();

  protected readonly tags = signal<string[]>([]);
  protected readonly tagDraft = signal('');

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    content: ['', [Validators.maxLength(50000)]],
  });

  protected readonly isEditing = computed(() => this.note() !== null);

  constructor() {
    // Hydrate the form whenever the bound note changes.
    effect(() => {
      const current = this.note();
      if (current) {
        this.form.setValue({
          title: current.title,
          content: current.content,
        });
        this.tags.set([...current.tags]);
      } else {
        this.form.reset({ title: '', content: '' });
        this.tags.set([]);
      }
      this.tagDraft.set('');
    });
  }

  protected onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commitTag();
    } else if (
      event.key === 'Backspace' &&
      this.tagDraft().length === 0 &&
      this.tags().length > 0
    ) {
      this.tags.update((list) => list.slice(0, -1));
    }
  }

  protected commitTag(): void {
    const raw = this.tagDraft().trim().toLowerCase();
    if (raw && !this.tags().includes(raw) && this.tags().length < 20) {
      this.tags.update((list) => [...list, raw]);
    }
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.tags.update((list) => list.filter((t) => t !== tag));
  }

  protected onSubmit(): void {
    this.commitTag();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, content } = this.form.getRawValue();
    this.save.emit({ title, content, tags: this.tags() });
  }

  protected onCancel(): void {
    this.cancel.emit();
  }
}
