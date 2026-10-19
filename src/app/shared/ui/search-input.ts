import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { MatFormField, MatPrefix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { AppIcon } from './app-icon';

/**
 * The search box of a list. It reports the text a moment after typing stops (so a request does not
 * go out per keystroke), at once on Enter and when focus leaves. `value` is the search the list
 * has now, normally from the URL: a change made elsewhere (clearing the filters, the Back button)
 * replaces the text, while the list catching up with what was typed does not.
 */
@Component({
  selector: 'app-search-input',
  imports: [AppIcon, MatFormField, MatInput, MatPrefix],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <app-icon matPrefix name="search" size="1.25rem" />
      <input
        matInput
        type="search"
        autocomplete="off"
        [attr.aria-label]="label()"
        [placeholder]="label()"
        [value]="draft()"
        (input)="onInput($event)"
        (keydown.enter)="flush()"
        (blur)="flush()"
      />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
      flex: 1 1 22rem;
      max-width: 30rem;
    }

    mat-form-field {
      width: 100%;
    }

    app-icon {
      margin-inline: 0.75rem 0.25rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SearchInput {
  /** Names the box and is its placeholder: "Search name, city or address". */
  readonly label = input.required<string>();
  /** The search the list shows now. */
  readonly value = input('');
  /** How long typing must pause before the text is reported, in milliseconds. */
  readonly delay = input(300);
  readonly searchChange = output<string>();

  /** The last text reported; the list coming back with it is not news. */
  private reported: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly draft = linkedSignal<string, string>({
    source: this.value,
    computation: (value, previous) => {
      if (previous && value === this.reported) return previous.value;
      // Any other search is news, and the one reported before is history: a later return to it
      // (the Back button) is news too.
      this.reported = undefined;
      return value;
    },
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
    });
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, this.delay());
  }

  protected flush(): void {
    clearTimeout(this.timer);
    const text = this.draft().trim();
    if (text === this.value().trim()) return;
    this.reported = text;
    this.searchChange.emit(text);
  }
}
