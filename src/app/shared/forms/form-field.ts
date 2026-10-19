import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

let nextId = 0;

/** What the field needs of a validation error; Signal Forms' errors and plain objects both fit. */
export interface FieldError {
  readonly message?: string;
}

/**
 * Gives a form control its label, a required marker, a hint and its error. The control is projected
 * and wired up by the form, through the template reference (`aria-describedby` is bound as the
 * `matInput` input, because Material owns that attribute):
 *
 * ```html
 * <app-form-field #name label="Name" [errors]="shown">
 *   <input matInput [id]="name.inputId" [aria-describedby]="name.describedBy()" />
 * </app-form-field>
 * ```
 *
 * Which errors to pass is the form's decision (usually only once the field was touched, so an
 * untouched form does not shout). The first one with a message is shown; it replaces the hint
 * rather than sitting beside it.
 */
@Component({
  selector: 'app-form-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [for]="inputId">
      {{ label() }}
      @if (required()) {
        <span class="marker" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (message(); as text) {
      <p class="note error" role="alert" [id]="errorId">{{ text }}</p>
    } @else if (hint(); as text) {
      <p class="note" [id]="hintId">{{ text }}</p>
    }
  `,
  styleUrl: './form-field.scss',
})
export class AppFormField {
  readonly label = input.required<string>();
  readonly required = input(false, { transform: booleanAttribute });
  readonly hint = input<string>();
  readonly errors = input<readonly FieldError[]>([]);

  /** Ids for the control (`id`) and its error and hint (`aria-describedby`). */
  readonly inputId = `app-field-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;
  protected readonly hintId = `${this.inputId}-hint`;

  protected readonly message = computed(
    () => this.errors().find((error) => error.message)?.message ?? '',
  );

  /** What to put in the control's `aria-describedby`: the error when there is one, else the hint, else nothing. */
  readonly describedBy = computed(() => {
    if (this.message()) return this.errorId;
    return this.hint() ? this.hintId : '';
  });
}
