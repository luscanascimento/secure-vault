import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

/**
 * All feature routes are lazily loaded (standalone components), keeping the
 * initial bundle lean. The vault is guarded; auth pages are guest-only.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'vault',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in — Secure Vault',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account — Secure Vault',
    loadComponent: () =>
      import('./features/auth/register.component').then(
        (m) => m.RegisterComponent,
      ),
  },
  {
    path: 'vault',
    canActivate: [authGuard],
    title: 'Your vault — Secure Vault',
    loadComponent: () =>
      import('./features/vault/vault.component').then((m) => m.VaultComponent),
  },
  {
    path: '**',
    redirectTo: 'vault',
  },
];
