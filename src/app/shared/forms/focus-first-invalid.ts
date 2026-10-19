import type { FieldTree } from '@angular/forms/signals';

/**
 * Moves focus to the first control whose field has an error, so a failed submit leaves the person
 * where the problem is. When only the form as a whole has errors (its banner announces them), focus
 * goes to the form's first control instead of being lost with the disabled fields. A form without
 * errors keeps its focus.
 */
export function focusFirstInvalid(form: FieldTree<unknown>): void {
  const root = form();
  const errors = root.errorSummary();
  if (errors.length === 0) return;
  const first = errors.find((error) => error.fieldTree() !== root);
  (first ? first.fieldTree() : root).focusBoundControl();
}
