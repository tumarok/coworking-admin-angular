/** Kinds of data the app caches. Mutations and queries meet at these names. */
export type EntityType = 'Location' | 'Room' | 'Member' | 'Booking' | 'Dashboard';

/**
 * Names a piece of cached data. A query declares the tags it shows; a mutation declares the tags
 * it makes stale. `id` is an entity id, or {@link LIST_ID} for "any list or collection of the type".
 */
export interface Tag {
  readonly type: EntityType;
  readonly id: string;
}

export const LIST_ID = 'LIST';

/** Matches every tag of a type, whatever its id. See {@link typeTag}. */
export const ANY_ID = '*';

export const listTag = (type: EntityType): Tag => ({ type, id: LIST_ID });
export const idTag = (type: EntityType, id: string): Tag => ({ type, id });

/** Every tag of the type at once: all of its lists and all of its details. Only for invalidation. */
export const typeTag = (type: EntityType): Tag => ({ type, id: ANY_ID });

export const tagKey = (tag: Tag) => `${tag.type}:${tag.id}`;

/**
 * Data that embeds another entity's fields (a booking carries its room's name, a location carries
 * its room count). Changing the key makes everything on the right stale too.
 */
const EMBEDDED_IN: Record<EntityType, readonly EntityType[]> = {
  Location: ['Room', 'Booking', 'Dashboard'],
  Room: ['Location', 'Booking', 'Dashboard'],
  Member: ['Booking', 'Dashboard'],
  Booking: ['Dashboard'],
  Dashboard: [],
};

/**
 * Tags to invalidate after creating (no ids) or updating (the ids) entities of a type: those
 * records, the lists, and everything that shows them.
 */
export function savedTags(type: EntityType, ...ids: string[]): Tag[] {
  return [...ids.map((id) => idTag(type, id)), listTag(type), ...dependentTags(type)];
}

/**
 * Tags to invalidate after deleting an entity. Its own detail is left alone on purpose: the page is
 * usually still on screen, and reloading it would answer 404 right after a successful delete.
 */
export function removedTags(type: EntityType): Tag[] {
  return [listTag(type), ...dependentTags(type)];
}

const dependentTags = (type: EntityType) => EMBEDDED_IN[type].map(typeTag);
