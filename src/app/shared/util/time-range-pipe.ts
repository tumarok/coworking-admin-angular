import { Pipe, type PipeTransform } from '@angular/core';
import { formatTimeRange, PLACEHOLDER } from './format';

/** A booking's span in its location's clock: `{{ b.startsAt | timeRange: b.endsAt : tz }}`. */
@Pipe({ name: 'timeRange' })
export class TimeRangePipe implements PipeTransform {
  transform(
    startIso: string | null | undefined,
    endIso: string | null | undefined,
    timeZone?: string,
  ): string {
    return startIso && endIso ? formatTimeRange(startIso, endIso, timeZone) : PLACEHOLDER;
  }
}
