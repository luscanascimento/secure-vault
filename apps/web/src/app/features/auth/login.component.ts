import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { extractErrorMessage } from '../../core/http-error';

@Component({
  selector: 'sv-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./auth-shell.css'],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected submit(): void {
    this.errorMsg.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl(this.redirectTarget());
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMsg.set(extractErrorMessage(err));
      },
    });
  }

  private redirectTarget(): string {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    return redirect && redirect.startsWith('/') ? redirect : '/vault';
  }
}
