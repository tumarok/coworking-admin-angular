import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  input,
} from '@angular/core';
import { PLACEHOLDER } from '@shared/util/format';
import { DetailsValue } from './details-value';

export interface DetailsField<T> {
  /** Unique within the list; also the key of a custom value (`appDetailValue`). */
  key: string;
  label: string;
  /** The text shown. A missing value reads "—". Not needed when the field has a custom value. */
  value?: (record: T) => string | number | null | undefined;
}

/**
 * The facts about one record as a grid of labelled values (a description list), on a card. A value
 * that is more than text, such as a status chip or a link, comes in through an `appDetailValue`
 * template.
 */
@Component({
  selector: 'app-details-list',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl>
      @for (field of fields(); track field.key) {
        <div>
          <dt>{{ field.label }}</dt>
          <dd>
            @let custom = templates().get(field.key);
            @if (custom) {
              <ng-container *ngTemplateOutlet="custom; context: { $implicit: record() }" />
            } @else {
              {{ textOf(field) }}
            }
          </dd>
        </div>
      }
    </dl>
  `,
  styleUrl: './details-list.scss',
})
export class DetailsList<T> {
  readonly record = input.required<T>();
  readonly fields = input.required<readonly DetailsField<T>[]>();

  private readonly customValues = contentChildren(DetailsValue);
  protected readonly templates = computed(
    () => new Map(this.customValues().map((value) => [value.key(), value.template])),
  );

  protected textOf(field: DetailsField<T>): string {
    const value = field.value?.(this.record());
    return value === null || value === undefined || value === '' ? PLACEHOLDER : String(value);
  }
}
