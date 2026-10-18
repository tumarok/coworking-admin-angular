import type { z } from 'zod';

import type { ApiErrorBody } from '@shared/api/contract';

/** Transport-neutral request: the Node server and the MSW handlers both translate into this. */
export interface ApiRequest {
  method: string;
  /** Path below the API prefix, e.g. "/locations/loc_1". */
  path: string;
  query: Record<string, string>;
  body?: unknown;
  authorization?: string | null;
}

export interface ApiResponse {
  status: number;
  body?: unknown;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

export const ok = (body: unknown): ApiResponse => ({ status: 200, body });
export const created = (body: unknown): ApiResponse => ({ status: 201, body });
export const noContent = (): ApiResponse => ({ status: 204 });

export const notFound = (what: string) => new HttpError(404, { message: `${what} not found` });
export const conflict = (message: string, extra: Partial<ApiErrorBody> = {}) =>
  new HttpError(409, { message, ...extra });
export const invalid = (fieldErrors: Record<string, string>, message = 'Validation failed') =>
  new HttpError(422, { message, fieldErrors });

/** Parses input with a contract schema; a failure becomes 422 with one message per field. */
export const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  throw invalid(fieldErrors);
};

/** Query strings arrive as strings; empty values mean "no filter". */
export const cleanQuery = (query: Record<string, string>) =>
  Object.fromEntries(Object.entries(query).filter(([, v]) => v !== ''));
