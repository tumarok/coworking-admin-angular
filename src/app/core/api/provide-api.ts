import { provideHttpClient, withInterceptors } from '@angular/common/http';
import type { EnvironmentProviders } from '@angular/core';
import { authInterceptor } from '@core/http/auth.interceptor';
import { baseUrlInterceptor } from '@core/http/base-url.interceptor';
import { errorInterceptor } from '@core/http/error.interceptor';
import { unauthorizedInterceptor } from '@core/http/unauthorized.interceptor';
import { cacheInterceptor } from './cache.interceptor';

/**
 * `HttpClient` with the API pipeline. A request passes the interceptors in this order, a response
 * or error passes them back in reverse:
 * the URL and token are completed first, so the cache keys on the real URL; the cache sits above
 * the error handling, so a cached answer never reports an error; errors reach the snackbar before
 * the session hook, and neither needs the other.
 */
export function provideApi(): EnvironmentProviders {
  return provideHttpClient(
    withInterceptors([
      baseUrlInterceptor,
      authInterceptor,
      cacheInterceptor,
      unauthorizedInterceptor,
      errorInterceptor,
    ]),
  );
}
