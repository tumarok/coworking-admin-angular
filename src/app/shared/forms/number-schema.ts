import { z } from 'zod';

/**
 * The schema of a number field the person may leave empty (a native number input then holds
 * `null`): the empty field gets its own message, and a number goes on to the rule.
 */
export const numberField = <T extends z.ZodType<number, number>>(missing: string, rule: T) =>
  z
    .number()
    .nullable()
    .pipe(z.number({ error: missing }))
    .pipe(rule);
