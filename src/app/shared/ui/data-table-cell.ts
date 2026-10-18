import { Directive, inject, input, TemplateRef } from '@angular/core';

/**
 * Replaces how a column draws its cells:
 *
 * ```html
 * <app-data-table ...>
 *   <ng-template appCell="status" let-row><app-status-chip [status]="row.status" /></ng-template>
 * </app-data-table>
 * ```
 *
 * The key is the `key` of the column; the row is the template's implicit value.
 */
@Directive({ selector: 'ng-template[appCell]' })
export class DataTableCell {
  readonly key = input.required<string>({ alias: 'appCell' });
  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
}
