import type { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, type Routes } from '@angular/router';

/**
 * Providers for specs that need the app's infrastructure.
 *
 * Change detection is zoneless without any provider: Angular 22 only uses zone.js when it is
 * installed, and this project does not install it.
 *
 * Requests go through `HttpTestingController`, so a test decides what the backend answers.
 */
export function provideTestApp(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()];
}
