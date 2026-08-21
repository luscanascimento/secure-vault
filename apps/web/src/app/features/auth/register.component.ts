import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import {
  extractErrorMessage,
  extractErrorSuggestions,
} from '../../core/http-error';

/** Client-side password policy mirrors the server DTO for immediate feedback. */
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

@Component({
  selector: 'sv-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./auth-shell.css'],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  /** Password-strength advice forwarded by the API on a 400. */
  protected readonly suggestions = signal<readonly string[]>([]);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(12),
        Validators.pattern(PASSWORD_PATTERN),
      ],
    ],
  });

  private readonly passwordValue = toSignal(
    this.form.controls.password.valueChanges,
    { initialValue: '' },
  );

  /** 0..3 strength score used to paint the meter. */
  protected readonly strength = computed(() => {
    const value = this.passwordValue();
    let score = 0;
    if (value.length >= 12) {
      score++;
    }
    if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)) {
      score++;
    }
    if (/[^A-Za-z0-9]/.test(value) && value.length >= 16) {
      score++;
    }
    return score;
  });

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submit(): void {
    this.errorMsg.set(null);
    this.suggestions.set([]);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.register(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl('/vault');
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMsg.set(extractErrorMessage(err));
        this.suggestions.set(extractErrorSuggestions(err));
      },
    });
  }
}
