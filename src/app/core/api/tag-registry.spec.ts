import { TestBed } from '@angular/core/testing';
import { TagRegistry } from './tag-registry';
import { idTag, listTag, typeTag } from './tags';

describe('TagRegistry', () => {
  let registry: TagRegistry;

  beforeEach(() => {
    registry = TestBed.inject(TagRegistry);
  });

  it('starts every tag at zero', () => {
    expect(registry.version(idTag('Room', 'room_1'))).toBe(0);
  });

  it('counts the invalidations of a tag and no other', () => {
    registry.invalidate([idTag('Room', 'room_1')]);
    registry.invalidate([idTag('Room', 'room_1')]);

    expect(registry.version(idTag('Room', 'room_1'))).toBe(2);
    expect(registry.version(idTag('Room', 'room_2'))).toBe(0);
    expect(registry.version(listTag('Room'))).toBe(0);
    expect(registry.version(idTag('Member', 'room_1'))).toBe(0);
  });

  it('lets a type tag reach every tag of the type', () => {
    registry.invalidate([typeTag('Booking')]);

    expect(registry.version(listTag('Booking'))).toBe(1);
    expect(registry.version(idTag('Booking', 'bk_1'))).toBe(1);
    expect(registry.version(listTag('Room'))).toBe(0);
  });

  it('raises a tag version on both its own and its type invalidations', () => {
    registry.invalidate([idTag('Booking', 'bk_1')]);
    const before = registry.version(idTag('Booking', 'bk_1'));
    registry.invalidate([typeTag('Booking')]);

    expect(registry.version(idTag('Booking', 'bk_1'))).toBeGreaterThan(before);
  });

  it('reads the versions of several tags at once', () => {
    registry.invalidate([listTag('Room')]);

    expect(registry.versionsOf([listTag('Room'), listTag('Member')])).toEqual([1, 0]);
  });

  it('ignores an empty batch', () => {
    registry.invalidate([]);

    expect(registry.versionsOf([listTag('Room')])).toEqual([0]);
  });
});
