import type { FieldTree, ValidationError } from '@angular/forms/signals';
import type { ApiError } from '@shared/api/api-error';

/** The `kind` of every error that comes from the server, which tells it from the schema's. */
const SERVER_ERROR_KIND = 'server';

/** The key the API uses for a problem with the request as a whole rather than one field. */
const WHOLE_FORM_KEY = '_';

/**
 * The field at a dotted path (`startsAt`, `items.0.name`), or `undefined` when the form has no such
 * field. The API names a field by its key in the request body, which is the form's model key when
 * the form is shaped like the body.
 */
export function fieldAt(form: FieldTree<unknown>, path: string): FieldTree<unknown> | undefined {
  let field = form;
  for (const key of path.split('.')) {
    const value: unknown = field().value();
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) {
      return undefined;
    }
    field = (field as unknown as Record<string, FieldTree<unknown>>)[key];
  }
  return field;
}

/**
 * Puts a failed save on the form. Return the result from the submit action and Signal Forms shows
 * each error on its field (`field().errors()`), and drops it as soon as that field's value changes.
 *
 * - 422 `fieldErrors`: one error per field the form has.
 * - A key the form has no field for, the key `_`, and every other failure (409, 500, no network): an
 *   error on the form itself, which the page shows as a banner (see {@link formLevelMessages}). A
 *   change to any field takes it away.
 * - Field errors come with an error on the form that has no message. It replaces a banner left by
 *   an earlier attempt, which would otherwise outlive the answer that makes it wrong.
 *
 * The errors on the form itself are about the attempt, not about the values, so a retry may pass:
 * {@link hasBlockingErrors} leaves them out when deciding whether to send again.
 */
export function serverErrors<T>(
  form: FieldTree<T>,
  error: ApiError,
): ValidationError.WithFieldTree[] {
  const errors = Object.entries(error.fieldErrors).map(([key, message]) => ({
    kind: SERVER_ERROR_KIND,
    message,
    fieldTree: (key === WHOLE_FORM_KEY ? undefined : fieldAt(form, key)) ?? form,
  }));
  if (errors.length === 0) {
    return [{ kind: SERVER_ERROR_KIND, message: error.message, fieldTree: form }];
  }
  return errors.some((e) => e.fieldTree === form)
    ? errors
    : [...errors, { kind: SERVER_ERROR_KIND, message: undefined, fieldTree: form }];
}

/**
 * Whether the form has an error the person must deal with before sending again: a field the schema
 * or the server found fault with. A refusal of the whole attempt (a 409, a 502, a lost connection)
 * does not count, so the form can be sent again as it is. Gate the Save button on this, not on
 * `form().valid()`, which stays false until a field is edited.
 */
export function hasBlockingErrors(form: FieldTree<unknown>): boolean {
  const root = form();
  return root
    .errorSummary()
    .some((error) => !(error.fieldTree() === root && error.kind === SERVER_ERROR_KIND));
}

/** The messages of the errors that belong to the form as a whole, for a banner above the fields. */
export function formLevelMessages(form: FieldTree<unknown>): string[] {
  return form()
    .errors()
    .flatMap((error) => (error.message ? [error.message] : []));
}
