import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AppIcon } from './app-icon';
import type { IconName } from './icon-paths';

/**
 * A centred notice for a place with nothing to show: no records, no result, a failed load. It
 * takes the next action (a link, a button) as projected content.
 */
@Component({
  selector: 'app-empty-state',
  imports: [AppIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-icon [name]="icon()" size="2.5rem" />
    @if (headingLevel() === 1) {
      <h1>{{ title() }}</h1>
    } @else {
      <h2>{{ title() }}</h2>
    }
    @if (message(); as message) {
      <p>{{ message }}</p>
    }
    <ng-content />
  `,
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly message = input<string>();
  readonly icon = input<IconName>('inbox');
  /** `1` when the notice is the whole page and so owns its `<h1>`. */
  readonly headingLevel = input<1 | 2>(2);
}
