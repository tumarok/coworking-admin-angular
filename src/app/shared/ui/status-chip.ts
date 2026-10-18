import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { humanize } from '@shared/util/format';
import { statusTone } from './status-tone';

/**
 * A status as a small pill: `no_show` reads "No show", in the tone of its meaning. The text is
 * what carries the status; the colour only supports it.
 */
@Component({
  selector: 'app-status-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"tone-" + tone()' },
  template: `<span class="dot" aria-hidden="true"></span>{{ label() }}`,
  styleUrl: './status-chip.scss',
})
export class StatusChip {
  readonly status = input.required<string>();
  protected readonly label = computed(() => humanize(this.status()));
  protected readonly tone = computed(() => statusTone(this.status()));
}
