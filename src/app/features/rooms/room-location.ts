import type { Room } from '@shared/api/contract';
import { PLACEHOLDER } from '@shared/util/format';

/** What to read where a room's location no longer exists, instead of a bare dash. */
export const DELETED_LOCATION = 'Deleted location';

/**
 * Whether the room's location still exists. The API fills `locationName` from the location and
 * answers the placeholder dash when there is none.
 */
export function hasLocation(room: Pick<Room, 'locationName'>): boolean {
  return room.locationName !== PLACEHOLDER;
}
