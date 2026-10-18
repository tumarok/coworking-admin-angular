import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Notifier } from '@core/notifications/notifier';
import { parseApiError } from '@shared/api/api-error';
import { catchError, throwError } from 'rxjs';
import { API_BASE_URL, isApiUrl, isLoginUrl } from './api-url';
import { SILENT } from './silent';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/**
 * Shows a snackbar for a failed API request unless the caller marked it {@link SILENT}. The error
 * still propagates, so pages can render their own state (a "not found" view, for instance).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const notifier = inject(Notifier);
  if (!isApiUrl(req.url, baseUrl) || req.context.get(SILENT)) return next(req);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const expired = error.status === 401 && !isLoginUrl(req.url, baseUrl);
        void notifier.error(expired ? SESSION_EXPIRED_MESSAGE : parseApiError(error).message);
      }
      return throwError(() => error);
    }),
  );
};
