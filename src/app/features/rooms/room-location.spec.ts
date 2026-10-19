import { DELETED_LOCATION, hasLocation } from './room-location';

describe('hasLocation', () => {
  it('is true for a room whose location the API named', () => {
    expect(hasLocation({ locationName: 'Riverside Hub' })).toBe(true);
  });

  it('is false for a room whose location is gone, which the API names with a dash', () => {
    expect(hasLocation({ locationName: '—' })).toBe(false);
  });

  it('has a text for that case that says what happened', () => {
    expect(DELETED_LOCATION).toBe('Deleted location');
  });
});
