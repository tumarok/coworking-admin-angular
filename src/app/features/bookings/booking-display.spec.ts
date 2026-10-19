import type { Booking } from '@shared/api/contract';
import { bookingLabel, hasLocation, hasMember, hasRoom, missingLocation } from './booking-display';

const BOOKING: Pick<
  Booking,
  'roomName' | 'memberName' | 'locationId' | 'locationName' | 'startsAt' | 'endsAt'
> = {
  roomName: 'Aurora',
  memberName: 'Ada Lovelace',
  locationId: 'loc_1',
  locationName: 'Riverside Hub',
  startsAt: '2026-07-01T06:00:00.000Z',
  endsAt: '2026-07-01T08:30:00.000Z',
};

describe('what a booking still has', () => {
  it('has a room, a member and a location while the API names them', () => {
    expect(hasRoom(BOOKING)).toBe(true);
    expect(hasMember(BOOKING)).toBe(true);
    expect(hasLocation(BOOKING)).toBe(true);
  });

  it('has none of them when the API answers the placeholder dash', () => {
    const gone = { ...BOOKING, roomName: '—', memberName: '—', locationName: '—', locationId: '' };

    expect(hasRoom(gone)).toBe(false);
    expect(hasMember(gone)).toBe(false);
    expect(hasLocation(gone)).toBe(false);
  });

  it('has no location when only the location is gone, or only its id is missing', () => {
    expect(hasLocation({ ...BOOKING, locationName: '—' })).toBe(false);
    expect(hasLocation({ ...BOOKING, locationId: '' })).toBe(false);
  });

  it('says a location is deleted when its room is there, and unknown when the room is gone too', () => {
    expect(missingLocation(BOOKING)).toBe('Deleted location');
    expect(missingLocation({ ...BOOKING, roomName: '—' })).toBe('Unknown location');
  });
});

describe('bookingLabel', () => {
  it('names the booking by its room and its span on the zone’s clock', () => {
    expect(bookingLabel(BOOKING, 'Europe/Kyiv')).toBe('Aurora, 01 Jul 2026, 09:00–11:30');
  });

  it('says the room is deleted when the API has no name for it, and reads UTC without a zone', () => {
    expect(bookingLabel({ ...BOOKING, roomName: '—' })).toBe(
      'Deleted room, 01 Jul 2026, 06:00–08:30 UTC',
    );
  });
});
