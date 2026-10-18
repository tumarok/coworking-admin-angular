import { HttpErrorResponse } from '@angular/common/http';
import type { BookingConflict } from '@shared/api/contract';

/** Texts for responses that carry no usable message of their own. */
export const NETWORK_ERROR_MESSAGE =
  'Cannot reach the server. Check your connection and try again.';
export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** What the UI needs to know about a failed request. */
export interface ApiError {
  /** HTTP status; 0 when no response arrived or the failure did not come from HTTP. */
  status: number;
  message: string;
  /** Form field to message, from a 422. The key `_` stands for the form as a whole. */
  fieldErrors: Record<string, string>;
  /** Existing bookings that overlap the requested slot, from a 409. */
  conflicts: BookingConflict[];
}

/**
 * Turns anything a failed request can throw into an {@link ApiError}. The server answers with the
 * contract's error body, but a proxy or a crash may answer with anything, so every part is checked
 * on its own and a bad part is dropped instead of discarding the rest. The checks are by hand, not
 * the contract's Zod schema, so that this file, which every request's error path loads, does not
 * pull Zod into the initial bundle.
 */
export function parseApiError(failure: unknown): ApiError {
  if (!(failure instanceof HttpErrorResponse)) {
    return { status: 0, message: GENERIC_ERROR_MESSAGE, fieldErrors: {}, conflicts: [] };
  }

  const { status } = failure;
  const body = readBody(failure.error);
  const message = isRecord(body) && typeof body['message'] === 'string' ? body['message'] : '';
  return {
    status,
    message: message || (status === 0 ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE),
    fieldErrors: isRecord(body) ? readFieldErrors(body['fieldErrors']) : {},
    conflicts: isRecord(body) ? readConflicts(body['conflicts']) : [],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readFieldErrors(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

function readConflicts(value: unknown): BookingConflict[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is BookingConflict =>
      isRecord(item) &&
      typeof item['id'] === 'string' &&
      typeof item['startsAt'] === 'string' &&
      typeof item['endsAt'] === 'string',
  );
}

/** Responses read as text arrive as a string that may hold JSON. */
function readBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
