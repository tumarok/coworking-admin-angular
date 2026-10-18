import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ICON_PATHS, type IconName } from './icon-paths';

/**
 * A decorative icon. It is hidden from assistive technology, so whatever it sits next to (a label
 * or an `aria-label` on the button) must carry the meaning.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--app-icon-size]': 'size()' },
  template: `
    <svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false">
      <path [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--app-icon-size, 1.5rem);
      height: var(--app-icon-size, 1.5rem);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `,
})
export class AppIcon {
  readonly name = input.required<IconName>();
  /** Any CSS length; the default is 1.5rem. */
  readonly size = input<string>();
  protected readonly path = computed(() => ICON_PATHS[this.name()]);
}
