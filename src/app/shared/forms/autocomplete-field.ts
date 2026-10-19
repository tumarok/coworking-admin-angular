import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import {
  MatAutocomplete,
  type MatAutocompleteSelectedEvent,
  MatAutocompleteTrigger,
} from '@angular/material/autocomplete';
import { MatOption } from '@angular/material/core';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/** One choice of the list: the value the form holds (an id) and the text the person reads. */
export interface AutocompleteOption {
  value: string;
  label: string;
}

/**
 * A choice among more records than a dropdown can hold, found by searching the server. For Signal
 * Forms: `[formField]="form.roomId"` on a field that holds the chosen record's id, or `''` for none.
 *
 * - **Search.** Typing reports the text a moment after it stops (`searchChange`); the page runs the
 *   query and hands the answer back as `options`. The control never filters by itself, so what it
 *   lists is what the server found.
 * - **Choice.** The value is an id only while a listed record is chosen: editing the text takes the
 *   choice back (`''`), so the form can never hold an id the box does not show. `selectedLabel` is
 *   the text of the chosen record for the cases the options do not hold it (a booking being
 *   edited, a prefilled id).
 * - **Announcements.** While the box has focus, a live region says how many records the search
 *   found (`total`, when the server found more than it listed).
 *
 * Its label belongs outside, in `app-form-field`: bind `[inputId]` and `[describedBy]` from it.
 */
@Component({
  selector: 'app-autocomplete-field',
  imports: [MatAutocomplete, MatAutocompleteTrigger, MatFormField, MatInput, MatOption],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <input
        #input
        matInput
        [id]="inputId()"
        [attr.data-autofocus]="initialFocus() ? '' : null"
        [aria-describedby]="describedBy()"
        [placeholder]="placeholder()"
        [matAutocomplete]="auto"
        [value]="text()"
        [disabled]="disabled()"
        [required]="required()"
        (input)="onInput($event)"
        (focus)="focused.set(true)"
        (blur)="onBlur()"
      />
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="display"
        (optionSelected)="pick($event)"
      >
        @for (option of options(); track option.value) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
        @if (options().length === 0 && text().trim()) {
          <mat-option disabled>No matches</mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
    <span class="visually-hidden" role="status">{{ announcement() }}</span>
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
export class AutocompleteField implements FormValueControl<string> {
  /** The id of the chosen record, or `''`. */
  readonly value = model('');

  // The rest of the Signal Forms contract: the form fills these in from the field's state.
  readonly disabled = input(false);
  readonly required = input(false);
  readonly invalid = input(false);
  readonly touched = input(false);
  readonly touch = output();

  readonly inputId = input.required<string>();
  readonly describedBy = input('');
  readonly placeholder = input('');
  /** Marks the box as the one to start in when a dialog opens (Material's `autoFocus` selector). */
  readonly initialFocus = input(false);

  /** What the search found, in the order to list it. */
  readonly options = input.required<readonly AutocompleteOption[]>();
  /** How many records match in all, when that is more than `options` lists. */
  readonly total = input<number>();
  /** The text of the chosen record when `options` does not hold it. */
  readonly selectedLabel = input('');
  /** How long typing must pause before the text is reported, in milliseconds. */
  readonly delay = input(300);
  /** The trimmed text of a search; `''` asks for the records with no search. */
  readonly searchChange = output<string>();

  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly materialInput = viewChild.required(MatInput);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly focused = signal(false);

  /**
   * What the box shows: the chosen record's text, or the text being typed. Typing clears the
   * value, and the text then stays as it is.
   */
  protected readonly text = linkedSignal<{ value: string; label: string }, string>({
    source: () => ({ value: this.value(), label: this.selectedLabel() }),
    computation: ({ value, label }, previous) => (value ? label : (previous?.value ?? '')),
  });

  /** Material writes this to the box when an option is chosen. */
  protected readonly display = (id: string | null): string =>
    this.options().find((option) => option.value === id)?.label ?? this.selectedLabel();

  protected readonly announcement = computed(() => {
    if (!this.focused()) return '';
    const listed = this.options().length;
    if (listed === 0) return 'No matches';
    const found = Math.max(this.total() ?? listed, listed);
    const matches = `${found} ${found === 1 ? 'match' : 'matches'}`;
    return found > listed ? `${matches}, showing the first ${listed}` : matches;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
    });
    // Material marks an input red from its forms control, which this one does not have, so it is
    // told: red only once the field was touched, as for the other fields.
    effect(() => {
      const input = this.materialInput();
      input.errorState = this.invalid() && this.touched();
      input.stateChanges.next();
    });
  }

  protected onInput(event: Event): void {
    const typed = (event.target as HTMLInputElement).value;
    this.text.set(typed);
    this.value.set('');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.searchChange.emit(typed.trim());
    }, this.delay());
  }

  protected pick(event: MatAutocompleteSelectedEvent): void {
    // A search for the text typed before the pick would only replace the list the pick came from.
    clearTimeout(this.timer);
    this.value.set(String(event.option.value));
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.touch.emit();
  }

  focus(options?: FocusOptions): void {
    this.inputElement().nativeElement.focus(options);
  }
}
