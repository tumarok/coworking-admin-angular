import { LOCATION_STATUSES, type LocationStatus, TIMEZONES } from '@shared/api/contract';
import type { SelectOption } from '@shared/ui/select-option';
import { humanize } from '@shared/util/format';

/** The status filter and the status field offer the same choices. */
export const STATUS_OPTIONS: readonly SelectOption<LocationStatus>[] = LOCATION_STATUSES.map(
  (value) => ({
    value,
    label: humanize(value),
  }),
);

/** Time zones are shown as the IANA names the API uses. */
export const TIMEZONE_OPTIONS: readonly SelectOption[] = TIMEZONES.map((value) => ({
  value,
  label: value,
}));
