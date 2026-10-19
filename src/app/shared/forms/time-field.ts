import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { MAT_DATE_LOCALE, type MatDateFormats } from '@angular/material/core';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import {
  MatTimepicker,
  MatTimepickerInput,
  MatTimepickerToggle,
} from '@angular/material/timepicker';
import { MAT_DATE_FNS_FORMATS, provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { enGB } from 'date-fns/locale/en-GB';
import { dateToTimeOfDay, timeOfDayToDate } from '@shared/util/time-of-day';

/** A 24-hour clock whatever the browser's language: the API speaks `HH:mm`. */
const TIME_FORMATS: MatDateFormats = {
  parse: { ...MAT_DATE_FNS_FORMATS.parse, timeInput: 'HH:mm' },
  display: { ...MAT_DATE_FNS_FORMATS.display, timeInput: 'HH:mm', timeOptionLabel: 'HH:mm' },
};

/**
 * A time-of-day control for Signal Forms: `[formField]="form.opensAt"` on a field that holds
 * `"HH:mm"`. The person types the time or picks it from a list in 15-minute steps (`mat-timepicker`,
 * which works with dates; the conversion is {@link timeOfDayToDate} and {@link dateToTimeOfDay}).
 * Text that is not a time makes the value `''`, which the form's schema words as an error.
 *
 * Its label belongs outside, in `app-form-field`: bind `[inputId]` and `[describedBy]` from it.
 * The date adapter is provided here, so only the forms with a time field load date-fns.
 */
@Component({
  selector: 'app-time-field',
  imports: [
    MatFormField,
    MatInput,
    MatSuffix,
    MatTimepicker,
    MatTimepickerInput,
    MatTimepickerToggle,
  ],
  providers: [provideDateFnsAdapter(TIME_FORMATS), { provide: MAT_DATE_LOCALE, useValue: enGB }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <input
        #input
        matInput
        autocomplete="off"
        [id]="inputId()"
        [aria-describedby]="describedBy()"
        [matTimepicker]="picker"
        [value]="date()"
        [disabled]="disabled()"
        [required]="required()"
        (valueChange)="value.set(toTime($event))"
        (blur)="touch.emit()"
      />
      <mat-timepicker-toggle matIconSuffix [for]="picker" [aria-label]="pickerLabel()" />
      <mat-timepicker #picker interval="15m" (closed)="touch.emit()" />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }

    mat-form-field {
      width: 100%;
    }
  `,
})
export class TimeField implements FormValueControl<string> {
  /** `"HH:mm"`, or `''` when nothing valid is entered. */
  readonly value = model('');

  // The rest of the Signal Forms contract: the form fills these in from the field's state.
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output();

  readonly inputId = input.required<string>();
  readonly describedBy = input('');
  /** What the button that opens the list is called: "Choose the opening time". */
  readonly pickerLabel = input('Choose a time');

  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly materialInput = viewChild.required(MatInput);

  protected readonly date = computed(() => timeOfDayToDate(this.value()));
  protected readonly toTime = dateToTimeOfDay;

  constructor() {
    // Material marks an input red from its forms control, which this one does not have, so it is
    // told: red only once the field was touched, as for the other fields.
    effect(() => {
      const input = this.materialInput();
      input.errorState = this.invalid() && this.touched();
      input.stateChanges.next();
    });
  }

  focus(options?: FocusOptions): void {
    this.inputElement().nativeElement.focus(options);
  }
}
