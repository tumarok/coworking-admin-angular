import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Notifier } from '@core/notifications/notifier';
import { parseApiError } from '@shared/api/api-error';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL, isApiUrl, isLoginUrl } from './api-url';
import { SILENT } from './silent';

/**
 * Shows a snackbar for a failed API request unless the caller marked it {@link SILENT}. The error
 * still propagates, so pages can render their own state (a "not found" view, for instance). A 401
 * outside the sign-in is left to the session (`ON_UNAUTHORIZED`), which says "session expired"
 * only when the rejected token was the current one: a stale answer must not announce anything.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const notifier = inject(Notifier);
  if (!isApiUrl(req.url, baseUrl) || req.context.get(SILENT)) return next(req);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const leftToSession = error.status === 401 && !isLoginUrl(req.url, baseUrl);
        if (!leftToSession) void notifier.error(parseApiError(error).message);
      }
      return throwError(() => error);
    }),
  );
};
