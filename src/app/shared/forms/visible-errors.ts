import type { FieldTree, ValidationError } from '@angular/forms/signals';

/**
 * The errors of a field that are worth showing: none until the person has been in the field, so an
 * untouched form does not shout. Pass the result to `app-form-field`:
 * `[errors]="visibleErrors(form.name)"`.
 *
 * An error that compares fields (closing after opening) sits on one of them, but changing the
 * other makes it true. Name the other fields it depends on, and the error shows once any of them
 * was touched: `visibleErrors(form.closesAt, form.opensAt)`.
 */
export function visibleErrors(
  field: FieldTree<unknown>,
  ...dependsOn: FieldTree<unknown>[]
): readonly ValidationError.WithFieldTree[] {
  const state = field();
  const touched = state.touched() || dependsOn.some((other) => other().touched());
  return touched ? state.errors() : [];
}
