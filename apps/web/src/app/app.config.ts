import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';

/**
 * Silent session bootstrap: on load, try to restore a session using the
 * httpOnly refresh cookie. Either way we flip `initialized` so the shell can
 * render (and guards can make an accurate decision).
 */
function restoreSession() {
  const auth = inject(AuthService);
  return (async () => {
    try {
      await firstValueFrom(auth.refresh());
      await firstValueFrom(auth.loadProfile());
    } catch {
      auth.clearSession();
    } finally {
      auth.markInitialized();
    }
  })();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(restoreSession),
  ],
};
