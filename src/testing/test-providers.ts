import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter, type Routes } from '@angular/router';
import { provideApi } from '@core/api/provide-api';
import { API_BASE_URL } from '@core/http/api-url';
import { ACCESS_TOKEN } from '@core/http/session-hooks';
import { apiUrl } from './msw-server';

/**
 * Providers for specs that need the app's infrastructure.
 *
 * Change detection is zoneless without any provider: Angular 22 only uses zone.js when it is
 * installed, and this project does not install it.
 *
 * Requests go through `HttpTestingController`, so a test decides what the backend answers.
 * Material's animations are off: a dialog or a drawer is open and closed at once, and there is
 * no animation to wait for.
 */
export function provideTestApp(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideTestMaterial(),
  ];
}

export function provideTestMaterial(): Provider {
  return { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } };
}

/**
 * The real API pipeline (base URL, token, cache, error handling) for specs that talk to the mock
 * API through MSW (see `installMockApi`). The base URL is absolute because Node's `fetch` rejects
 * relative ones, and the token comes from where `signIn()` puts it.
 */
export function provideTestApi(): (Provider | EnvironmentProviders)[] {
  return [
    provideApi(),
    { provide: API_BASE_URL, useValue: apiUrl('') },
    { provide: ACCESS_TOKEN, useValue: () => sessionStorage.getItem('coworking-admin.token') },
    provideTestMaterial(),
  ];
}
