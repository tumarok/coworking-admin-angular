import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL, isApiUrl } from './api-url';
import { ACCESS_TOKEN } from './session-hooks';

/** Adds the bearer token to API requests while somebody is signed in. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(ACCESS_TOKEN)();
  if (!token || !isApiUrl(req.url, inject(API_BASE_URL))) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
