import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormField } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import type { SelectOption } from './select-option';

/**
 * One filter of a list: a dropdown whose first entry means "no filter" ("Any status"). `value` is
 * the filter's current value (`undefined` for none), normally from the URL; `(valueChange)` carries
 * the chosen one, `undefined` for the "any" entry.
 */
@Component({
  selector: 'app-filter-select',
  imports: [MatFormField, MatOption, MatSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-select
        [aria-label]="label()"
        [value]="value() ?? ''"
        (selectionChange)="valueChange.emit($event.value || undefined)"
      >
        <mat-option value="">{{ anyLabel() }}</mat-option>
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      min-width: 11rem;
    }

    mat-form-field {
      width: 100%;
    }
  `,
})
export class FilterSelect<V extends string = string> {
  /** Names the filter for assistive technology: "Status". */
  readonly label = input.required<string>();
  /** The entry that switches the filter off: "Any status". */
  readonly anyLabel = input.required<string>();
  readonly options = input.required<readonly SelectOption<V>[]>();
  readonly value = input<V>();
  readonly valueChange = output<V | undefined>();
}
