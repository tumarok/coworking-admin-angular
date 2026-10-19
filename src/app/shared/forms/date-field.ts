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
import { MAT_DATE_LOCALE } from '@angular/material/core';
import {
  MatDatepicker,
  MatDatepickerInput,
  type MatDatepickerInputEvent,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { dateToIsoDate, isoDateToDate } from '@shared/util/calendar-date';
import { enGB } from 'date-fns/locale/en-GB';

const DAY_FIRST = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const YEAR_FIRST = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The day a date stands for, when the text it came from says it plainly (`14/10/2026` or
 * `2026-10-14`, the year in four digits). Material reads much less than that as a date: `12` is
 * the year 1200, `14/10/2` the year 2. Such unfinished text counts as no day, so the form (and a
 * request behind it) does not chase every keystroke.
 */
function dayOf(date: Date | null | undefined, text: string): string {
  if (!date) return '';
  const typed = text.trim();
  const dayFirst = DAY_FIRST.exec(typed);
  const yearFirst = YEAR_FIRST.exec(typed);
  const [day, month, year] = dayFirst
    ? [dayFirst[1], dayFirst[2], dayFirst[3]]
    : yearFirst
      ? [yearFirst[3], yearFirst[2], yearFirst[1]]
      : [];
  const reads =
    Number(day) === date.getDate() &&
    Number(month) === date.getMonth() + 1 &&
    Number(year) === date.getFullYear();
  return reads ? dateToIsoDate(date) : '';
}

/**
 * A calendar-date control for Signal Forms: `[formField]="form.date"` on a field that holds
 * `"YYYY-MM-DD"`, or `''` for none. The person types the date (day first, `14/10/2026`) or picks
 * it from a calendar (`mat-datepicker`, which works with dates; the conversion is
 * {@link isoDateToDate} and {@link dateToIsoDate}). Text that is not a date makes the value `''`,
 * which the form's schema words as an error.
 *
 * It names itself in one of two ways: by the label of the `app-form-field` around it (bind
 * `[inputId]` and `[describedBy]` from it), or, without a visible label, by `ariaLabel` (a filter
 * of a list). `earliest` and `latest` bound the calendar, not what is typed. The date adapter is provided
 * here, so only the screens with a date field load date-fns.
 */
@Component({
  selector: 'app-date-field',
  imports: [
    MatDatepicker,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatFormField,
    MatInput,
    MatSuffix,
  ],
  providers: [provideDateFnsAdapter(), { provide: MAT_DATE_LOCALE, useValue: enGB }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <input
        #input
        matInput
        autocomplete="off"
        [id]="inputId()"
        [attr.aria-label]="ariaLabel() || null"
        [aria-describedby]="describedBy()"
        [placeholder]="placeholder()"
        [matDatepicker]="picker"
        [min]="minDate()"
        [max]="maxDate()"
        [disabled]="disabled()"
        [required]="required()"
        (dateInput)="onDate($event)"
        (dateChange)="onDate($event)"
        (blur)="touch.emit()"
      />
      <mat-datepicker-toggle matIconSuffix [for]="picker" [aria-label]="pickerLabel()" />
      <mat-datepicker #picker (closed)="touch.emit()" />
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
export class DateField implements FormValueControl<string> {
  /** `"YYYY-MM-DD"`, or `''` when nothing valid is entered. */
  readonly value = model('');

  // The rest of the Signal Forms contract: the form fills these in from the field's state.
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output();

  readonly inputId = input('');
  readonly describedBy = input('');
  /** Names the box when no visible label does: "From date". */
  readonly ariaLabel = input('');
  readonly placeholder = input('dd/mm/yyyy');
  /** What the button that opens the calendar is called. */
  readonly pickerLabel = input('Choose a date');
  /** The earliest and the latest day the calendar offers, as `YYYY-MM-DD`. */
  readonly earliest = input('');
  readonly latest = input('');

  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly materialInput = viewChild.required(MatInput);
  private readonly datepickerInput =
    viewChild.required<MatDatepickerInput<Date>>(MatDatepickerInput);

  protected readonly minDate = computed(() => isoDateToDate(this.earliest()));
  protected readonly maxDate = computed(() => isoDateToDate(this.latest()));

  constructor() {
    // The box is written to only when the form holds a day other than the one it shows. What the
    // person types reaches the form first, so it is never written back: a half-typed year, which
    // reads as a date of its own, would otherwise be reformatted under the cursor.
    effect(() => {
      const value = this.value();
      const datepicker = this.datepickerInput();
      if (this.shownDay(datepicker.value) !== value) datepicker.value = isoDateToDate(value);
    });

    // Material marks an input red from its forms control, which this one does not have, so it is
    // told: red only once the field was touched, as for the other fields.
    effect(() => {
      const input = this.materialInput();
      input.errorState = this.invalid() && this.touched();
      input.stateChanges.next();
    });
  }

  protected onDate(event: MatDatepickerInputEvent<Date>): void {
    this.value.set(this.shownDay(event.value));
  }

  private shownDay(date: Date | null): string {
    return dayOf(date, this.inputElement().nativeElement.value);
  }

  focus(options?: FocusOptions): void {
    this.inputElement().nativeElement.focus(options);
  }
}
