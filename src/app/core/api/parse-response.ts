import type { z } from 'zod';

/**
 * Checks a response against its contract schema without ever rejecting it. A mismatch is a bug to
 * fix, but the data the server sent is still better on screen than an error page, so it is logged
 * and returned as received. Rejecting would turn contract drift into an outage.
 */
export function parseResponse<T>(schema: z.ZodType<T>, label: string): (raw: unknown) => T {
  return (raw) => {
    const result = schema.safeParse(raw);
    if (result.success) return result.data;

    console.error(`Contract mismatch in ${label}`, result.error.issues);
    return raw as T;
  };
}
