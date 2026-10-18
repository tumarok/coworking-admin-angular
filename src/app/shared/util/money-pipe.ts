import { Pipe, type PipeTransform } from '@angular/core';
import { formatMoney, PLACEHOLDER } from './format';

/** Integer cents as euros: `{{ room.hourlyRate | money }}` -> `€12.50`. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    return cents === null || cents === undefined ? PLACEHOLDER : formatMoney(cents);
  }
}
