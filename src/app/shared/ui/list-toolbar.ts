import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';

/**
 * The row above a list: the search box and filters (projected) and, once any of them narrows the
 * list, a button that clears them all. The button goes away once it has worked, so focus moves to
 * the first control (normally the search box) instead of being lost with it.
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [MatButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #controls class="controls" role="search" [attr.aria-label]="label()">
      <ng-content />
    </div>
    @if (filtersActive()) {
      <button mat-button type="button" (click)="clear()">Clear filters</button>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `,
})
export class ListToolbar {
  /** Names the search landmark: "Filter locations". */
  readonly label = input('Filters');
  /** A search or a filter is narrowing the list. */
  readonly filtersActive = input(false);
  readonly clearClick = output();

  private readonly controls = viewChild.required<ElementRef<HTMLElement>>('controls');

  /** Moves focus to the first control (normally the search box). */
  focusFirst(): void {
    this.controls()
      .nativeElement.querySelector<HTMLElement>(
        'input, select, textarea, button, [role="combobox"]',
      )
      ?.focus();
  }

  protected clear(): void {
    this.focusFirst();
    this.clearClick.emit();
  }
}
