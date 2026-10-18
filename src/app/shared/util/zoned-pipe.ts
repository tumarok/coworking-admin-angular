import { Pipe, type PipeTransform } from '@angular/core';
import { formatDate, formatDateTime, formatTime, PLACEHOLDER } from './format';

export type ZonedFormat = 'date' | 'time' | 'dateTime';

/**
 * An instant in the clock of an IANA time zone: `{{ booking.startsAt | zoned: 'dateTime' :
 * location.timezone }}`. Without a zone it reads in UTC, never in the browser's zone.
 */
@Pipe({ name: 'zoned' })
export class ZonedPipe implements PipeTransform {
  transform(iso: string | null | undefined, format: ZonedFormat, timeZone?: string): string {
    if (!iso) return PLACEHOLDER;
    switch (format) {
      case 'date':
        return formatDate(iso, timeZone);
      case 'time':
        return formatTime(iso, timeZone);
      case 'dateTime':
        return formatDateTime(iso, timeZone);
    }
  }
}
