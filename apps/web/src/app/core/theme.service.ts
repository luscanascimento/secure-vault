import { Injectable, effect, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'sv-theme';

/**
 * Light/dark theme, persisted to localStorage and reflected on the <html>
 * element via `data-theme`. Only a non-sensitive UI preference is stored here.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.initial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const value = this._theme();
      document.documentElement.setAttribute('data-theme', value);
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* storage may be unavailable — non-critical */
      }
    });
  }

  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private initial(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      /* ignore */
    }
    const prefersLight =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }
}
