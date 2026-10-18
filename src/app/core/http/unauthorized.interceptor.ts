import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL, isApiUrl, isLoginUrl } from './api-url';
import { ON_UNAUTHORIZED } from './session-hooks';

/**
 * Reports a rejected token through {@link ON_UNAUTHORIZED}. It does so even for silent requests: a
 * form that handles its own errors still has no session to continue with.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const onUnauthorized = inject(ON_UNAUTHORIZED);
  if (!isApiUrl(req.url, baseUrl) || isLoginUrl(req.url, baseUrl)) return next(req);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) onUnauthorized();
      return throwError(() => error);
    }),
  );
};
