import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { NotesService } from './core/notes.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'sv-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="topbar">
      <a class="brand" routerLink="/vault" aria-label="Secure Vault home">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <path
              d="M16 4l9 3.3v6.7C25 20.7 21.2 25 16 26.4 10.8 25 7 20.7 7 14V7.3L16 4z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
            <rect x="12" y="15" width="8" height="6.4" rx="1.4" fill="currentColor" />
            <path
              d="M13.2 15v-1.8a2.8 2.8 0 0 1 5.6 0V15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
          </svg>
        </span>
        <span class="brand-text">
          Secure<span class="brand-accent">Vault</span>
        </span>
      </a>

      <div class="topbar-actions">
        @if (auth.isAuthenticated()) {
          <span class="user-pill mono" title="Signed in">
            {{ auth.user()?.email }}
          </span>
          <button class="btn btn-ghost" type="button" (click)="signOut()">
            Sign out
          </button>
        }
        <button
          class="icon-btn"
          type="button"
          (click)="theme.toggle()"
          [attr.aria-label]="
            theme.theme() === 'dark'
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          "
        >
          @if (theme.theme() === 'dark') {
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="currentColor" />
              <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
                <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
              </g>
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"
                fill="currentColor"
              />
            </svg>
          }
        </button>
      </div>
    </header>

    <main id="main" class="shell">
      @if (auth.initialized()) {
        <router-outlet />
      } @else {
        <div class="boot" role="status" aria-live="polite">
          <span class="boot-ring" aria-hidden="true"></span>
          <p class="mono">Decrypting session…</p>
        </div>
      }
    </main>

    <footer class="foot mono">
      <span>AES-256-GCM · Argon2id · rotating JWT</span>
      <span class="foot-dot">•</span>
      <span>note bodies encrypted at rest</span>
    </footer>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }

      .skip-link {
        position: absolute;
        left: -999px;
        top: 0;
        background: var(--accent);
        color: #052014;
        padding: 0.6rem 1rem;
        border-radius: 0 0 var(--radius) 0;
        font-weight: 600;
        z-index: 100;
      }
      .skip-link:focus {
        left: 0;
      }

      .topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem clamp(1rem, 4vw, 2.4rem);
        border-bottom: 1px solid var(--border);
        background: color-mix(in oklab, var(--bg) 82%, transparent);
        backdrop-filter: blur(14px);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--text);
      }
      .brand-mark {
        color: var(--accent);
        display: inline-flex;
        filter: drop-shadow(0 0 10px var(--accent-glow));
      }
      .brand-text {
        font-family: var(--font-display);
        font-weight: 600;
        font-size: 1.25rem;
        letter-spacing: -0.01em;
      }
      .brand-accent {
        color: var(--accent);
      }

      .topbar-actions {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      .user-pill {
        font-size: 0.78rem;
        color: var(--text-dim);
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--bg-veil);
        max-width: 42vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius);
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-dim);
        cursor: pointer;
        transition:
          color 0.2s var(--ease),
          border-color 0.2s var(--ease),
          transform 0.12s var(--ease);
      }
      .icon-btn:hover {
        color: var(--accent);
        border-color: var(--accent);
        transform: translateY(-1px);
      }
      .icon-btn:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .shell {
        flex: 1;
        width: 100%;
        max-width: 1120px;
        margin: 0 auto;
        padding: clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 2.4rem);
      }

      .boot {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 6rem 0;
        color: var(--text-faint);
      }
      .boot-ring {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 2px solid var(--border);
        border-top-color: var(--accent);
        animation: spin 0.8s linear infinite;
      }

      .foot {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        padding: 1.4rem;
        font-size: 0.74rem;
        color: var(--text-faint);
        border-top: 1px solid var(--border);
      }
      .foot-dot {
        color: var(--accent);
      }

      @media (max-width: 560px) {
        .user-pill {
          display: none;
        }
      }
    `,
  ],
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  private readonly notes = inject(NotesService);
  private readonly router = inject(Router);

  signOut(): void {
    this.auth.logout().subscribe({
      next: () => this.afterSignOut(),
      error: () => this.afterSignOut(),
    });
  }

  private afterSignOut(): void {
    this.auth.clearSession();
    this.notes.clear();
    void this.router.navigate(['/login']);
  }
}
