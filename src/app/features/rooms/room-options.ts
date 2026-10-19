import {
  AMENITIES,
  type Amenity,
  ROOM_STATUSES,
  ROOM_TYPES,
  type RoomStatus,
  type RoomType,
} from '@shared/api/contract';
import type { SelectOption } from '@shared/ui/select-option';
import { humanize } from '@shared/util/format';

const optionsOf = <V extends string>(values: readonly V[]): readonly SelectOption<V>[] =>
  values.map((value) => ({ value, label: humanize(value) }));

/** The filters and the form's fields offer the same choices. */
export const TYPE_OPTIONS: readonly SelectOption<RoomType>[] = optionsOf(ROOM_TYPES);
export const STATUS_OPTIONS: readonly SelectOption<RoomStatus>[] = optionsOf(ROOM_STATUSES);
export const AMENITY_OPTIONS: readonly SelectOption<Amenity>[] = optionsOf(AMENITIES);
