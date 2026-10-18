import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL, API_ENDPOINT, toApiUrl } from './api-url';

/** Resolves the endpoint paths of the data layer against the API base URL. */
export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(API_ENDPOINT)) return next(req);

  const url = toApiUrl(req.url, inject(API_BASE_URL));
  return next(url === req.url ? req : req.clone({ url }));
};
