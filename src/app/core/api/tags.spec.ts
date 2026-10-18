import { idTag, listTag, removedTags, savedTags, tagKey, typeTag } from './tags';

describe('tags', () => {
  it('names a record, a list and a whole type', () => {
    expect(tagKey(idTag('Room', 'room_1'))).toBe('Room:room_1');
    expect(tagKey(listTag('Room'))).toBe('Room:LIST');
    expect(tagKey(typeTag('Room'))).toBe('Room:*');
  });

  it('after a create, makes the lists and what shows the entity stale', () => {
    expect(savedTags('Room').map(tagKey)).toEqual([
      'Room:LIST',
      'Location:*',
      'Booking:*',
      'Dashboard:*',
    ]);
  });

  it('after an update, also makes the updated records stale', () => {
    expect(savedTags('Member', 'mem_1', 'mem_2').map(tagKey)).toEqual([
      'Member:mem_1',
      'Member:mem_2',
      'Member:LIST',
      'Booking:*',
      'Dashboard:*',
    ]);
  });

  it('after a delete, leaves the deleted record alone', () => {
    expect(removedTags('Location').map(tagKey)).toEqual([
      'Location:LIST',
      'Room:*',
      'Booking:*',
      'Dashboard:*',
    ]);
  });

  it('lets a booking change reach only the dashboard', () => {
    expect(savedTags('Booking', 'bk_1').map(tagKey)).toEqual([
      'Booking:bk_1',
      'Booking:LIST',
      'Dashboard:*',
    ]);
  });
});
