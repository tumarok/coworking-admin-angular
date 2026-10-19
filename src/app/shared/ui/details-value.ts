import { Directive, inject, input, TemplateRef } from '@angular/core';

/**
 * Replaces how one field of an `app-details-list` draws its value; the record is the template's
 * implicit value:
 *
 * ```html
 * <app-details-list [record]="room" [fields]="fields">
 *   <ng-template appDetailValue="status" let-room><app-status-chip [status]="room.status" /></ng-template>
 * </app-details-list>
 * ```
 *
 * The key is the `key` of the field.
 */
@Directive({ selector: 'ng-template[appDetailValue]' })
export class DetailsValue {
  readonly key = input.required<string>({ alias: 'appDetailValue' });
  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
}
