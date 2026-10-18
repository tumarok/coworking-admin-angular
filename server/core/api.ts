import {
  BOOKING_STATUSES,
  type BookingStatus,
  bookingInputSchema,
  bookingListQuerySchema,
  bookingStatusChangeSchema,
  bulkBookingRequestSchema,
  canTransition,
  dashboardQuerySchema,
  locationInputSchema,
  locationListQuerySchema,
  loginRequestSchema,
  memberFullName,
  memberInputSchema,
  memberListQuerySchema,
  roomInputSchema,
  roomListQuerySchema,
} from '@shared/api/contract';

import {
  type BookingRecord,
  type Db,
  type LocationRecord,
  type RoomRecord,
  type SeedOptions,
  createDb,
  nextId,
  type UserRecord,
} from './db';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  cleanQuery,
  conflict,
  created,
  noContent,
  notFound,
  ok,
  parse,
  invalid,
} from './http';
import { assertBookable, bookingPrice, hasUpcomingBookings, isOccupying } from './rules';

const DAY = 86_400_000;
const HOUR = 3_600_000;

interface Ctx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  user: UserRecord | null;
}

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  auth: boolean;
  handler: (ctx: Ctx) => ApiResponse;
}

const TOKEN_PREFIX = 'demo-token.';

const paginate = <T>(items: T[], page: number, limit: number) => ({
  items: items.slice((page - 1) * limit, page * limit),
  total: items.length,
  page,
  limit,
});

const matches = (q: string | undefined, ...fields: (string | null | undefined)[]) => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
};

const humanStatus = (s: BookingStatus) => s.replace('_', ' ');

export interface ApiOptions extends SeedOptions {
  /** Clock used for "upcoming" checks and the dashboard; injectable for tests. */
  clock?: () => number;
}

export interface MockApi {
  handle: (req: ApiRequest) => ApiResponse;
  reset: () => void;
  readonly db: Db;
}

export const createApi = (options: ApiOptions = {}): MockApi => {
  const clock = options.clock ?? (() => Date.now());
  let db = createDb({ seed: options.seed, now: options.now ?? clock() });

  const routes: Route[] = [];
  const route = (
    method: string,
    path: string,
    handler: Route['handler'],
    { auth = true }: { auth?: boolean } = {},
  ) => {
    const keys: string[] = [];
    const source = path.replace(/:(\w+)/g, (_m, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, auth, handler });
  };

  // --- views -------------------------------------------------------------------------------------
  const locationView = (l: LocationRecord) => ({
    ...l,
    roomCount: db.rooms.filter((r) => r.locationId === l.id).length,
  });
  const roomView = (r: RoomRecord) => ({
    ...r,
    locationName: db.locations.find((l) => l.id === r.locationId)?.name ?? '—',
  });
  const bookingView = (b: BookingRecord) => {
    const room = db.rooms.find((r) => r.id === b.roomId);
    const location = db.locations.find((l) => l.id === room?.locationId);
    const member = db.members.find((m) => m.id === b.memberId);
    return {
      ...b,
      roomName: room?.name ?? '—',
      locationId: location?.id ?? '',
      locationName: location?.name ?? '—',
      memberName: member ? memberFullName(member) : '—',
    };
  };

  const findOr404 = <T extends { id: string }>(
    items: T[],
    id: string | undefined,
    what: string,
  ) => {
    const item = items.find((i) => i.id === id);
    if (!item) throw notFound(what);
    return item;
  };

  // --- auth --------------------------------------------------------------------------------------
  route(
    'POST',
    '/auth/login',
    ({ body }) => {
      const { email, password } = parse(loginRequestSchema, body);
      const user = db.users.find((u) => u.email === email.toLowerCase() && u.password === password);
      if (!user) throw new HttpError(401, { message: 'Invalid email or password' });
      const { password: _password, ...publicUser } = user;
      return ok({ token: `${TOKEN_PREFIX}${user.id}`, user: publicUser });
    },
    { auth: false },
  );
  route('GET', '/auth/me', ({ user }) => {
    if (!user) throw new HttpError(401, { message: 'Authentication required' });
    const { password: _password, ...publicUser } = user;
    return ok(publicUser);
  });
  route(
    'POST',
    '/__reset',
    () => {
      db = createDb({ seed: options.seed, now: options.now ?? clock() });
      return noContent();
    },
    { auth: false },
  );

  // --- dashboard ---------------------------------------------------------------------------------
  route('GET', '/dashboard', ({ query }) => {
    const now = clock();
    const date =
      parse(dashboardQuerySchema, cleanQuery(query)).date ??
      new Date(now).toISOString().slice(0, 10);
    const dayStart = Date.parse(`${date}T00:00:00.000Z`);
    const onDay = db.bookings.filter((b) => {
      const t = Date.parse(b.startsAt);
      return t >= dayStart && t < dayStart + DAY;
    });
    const live = onDay.filter((b) => isOccupying(b.status) || b.status === 'completed');

    const occupancy = db.locations
      .filter((l) => l.status === 'active')
      .map((l) => {
        const rooms = db.rooms.filter((r) => r.locationId === l.id && r.status === 'available');
        const roomIds = new Set(rooms.map((r) => r.id));
        const [oh = 0, om = 0] = l.opensAt.split(':').map(Number);
        const [ch = 0, cm = 0] = l.closesAt.split(':').map(Number);
        const openHours = ch + cm / 60 - (oh + om / 60);
        const bookedHours = live
          .filter((b) => roomIds.has(b.roomId))
          .reduce((sum, b) => sum + (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / HOUR, 0);
        return {
          locationId: l.id,
          locationName: l.name,
          bookedHours: Math.round(bookedHours * 2) / 2,
          availableHours: rooms.length * openHours,
        };
      });
    const totalAvailable = occupancy.reduce((s, o) => s + o.availableHours, 0);
    const totalBooked = occupancy.reduce((s, o) => s + o.bookedHours, 0);

    const byStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0])) as Record<
      BookingStatus,
      number
    >;
    for (const b of onDay) byStatus[b.status] += 1;

    const month = date.slice(0, 7);
    const revenueMonth = db.bookings
      .filter(
        (b) =>
          b.startsAt.startsWith(month) &&
          ['confirmed', 'checked_in', 'completed'].includes(b.status),
      )
      .reduce((s, b) => s + b.totalPrice, 0);

    const upcoming = db.bookings
      .filter(
        (b) =>
          Date.parse(b.startsAt) >= now && (b.status === 'pending' || b.status === 'confirmed'),
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 8)
      .map(bookingView);

    return ok({
      date,
      kpis: {
        bookingsToday: onDay.filter((b) => b.status !== 'cancelled').length,
        occupancyRate: totalAvailable > 0 ? Math.min(1, totalBooked / totalAvailable) : 0,
        revenueMonth,
        activeMembers: db.members.filter((m) => m.status === 'active').length,
      },
      occupancy,
      byStatus,
      upcoming,
    });
  });

  // --- locations ---------------------------------------------------------------------------------
  route('GET', '/locations', ({ query }) => {
    const { page, limit, q, city, status } = parse(locationListQuerySchema, cleanQuery(query));
    const items = db.locations
      .filter((l) => matches(q, l.name, l.city, l.address))
      .filter((l) => !city || l.city.toLowerCase() === city.toLowerCase())
      .filter((l) => !status || l.status === status)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(locationView);
    return ok(paginate(items, page, limit));
  });
  route('GET', '/locations/:id', ({ params }) =>
    ok(locationView(findOr404(db.locations, params['id'], 'Location'))),
  );
  route('POST', '/locations', ({ body }) => {
    const input = parse(locationInputSchema, body);
    const location = { id: nextId(db, 'loc'), ...input };
    db.locations.push(location);
    return created(locationView(location));
  });
  route('PATCH', '/locations/:id', ({ params, body }) => {
    const location = findOr404(db.locations, params['id'], 'Location');
    Object.assign(location, parse(locationInputSchema, body));
    return ok(locationView(location));
  });
  route('DELETE', '/locations/:id', ({ params }) => {
    const location = findOr404(db.locations, params['id'], 'Location');
    if (db.rooms.some((r) => r.locationId === location.id)) {
      throw conflict('Remove or move the rooms of this location first');
    }
    db.locations = db.locations.filter((l) => l.id !== location.id);
    return noContent();
  });

  // --- rooms -------------------------------------------------------------------------------------
  route('GET', '/rooms', ({ query }) => {
    const { page, limit, q, locationId, type, status, minCapacity } = parse(
      roomListQuerySchema,
      cleanQuery(query),
    );
    const items = db.rooms
      .map(roomView)
      .filter((r) => matches(q, r.name, r.locationName))
      .filter((r) => !locationId || r.locationId === locationId)
      .filter((r) => !type || r.type === type)
      .filter((r) => !status || r.status === status)
      .filter((r) => !minCapacity || r.capacity >= minCapacity)
      .sort((a, b) => a.locationName.localeCompare(b.locationName) || a.name.localeCompare(b.name));
    return ok(paginate(items, page, limit));
  });
  route('GET', '/rooms/:id', ({ params }) =>
    ok(roomView(findOr404(db.rooms, params['id'], 'Room'))),
  );
  route('POST', '/rooms', ({ body }) => {
    const input = parse(roomInputSchema, body);
    if (!db.locations.some((l) => l.id === input.locationId)) {
      throw invalid({ locationId: 'Location not found' });
    }
    const room = { id: nextId(db, 'room'), ...input };
    db.rooms.push(room);
    return created(roomView(room));
  });
  route('PATCH', '/rooms/:id', ({ params, body }) => {
    const room = findOr404(db.rooms, params['id'], 'Room');
    const input = parse(roomInputSchema, body);
    if (!db.locations.some((l) => l.id === input.locationId)) {
      throw invalid({ locationId: 'Location not found' });
    }
    Object.assign(room, input);
    return ok(roomView(room));
  });
  route('DELETE', '/rooms/:id', ({ params }) => {
    const room = findOr404(db.rooms, params['id'], 'Room');
    if (
      hasUpcomingBookings(
        db.bookings.filter((b) => b.roomId === room.id),
        clock(),
      )
    ) {
      throw conflict('This room has upcoming bookings; cancel them first');
    }
    db.rooms = db.rooms.filter((r) => r.id !== room.id);
    return noContent();
  });

  // --- members -----------------------------------------------------------------------------------
  const assertUniqueEmail = (email: string, exceptId?: string) => {
    if (db.members.some((m) => m.email === email.toLowerCase() && m.id !== exceptId)) {
      throw invalid({ email: 'This email is already registered' });
    }
  };
  route('GET', '/members', ({ query }) => {
    const { page, limit, q, plan, status } = parse(memberListQuerySchema, cleanQuery(query));
    const items = db.members
      .filter((m) => matches(q, memberFullName(m), m.email, m.company))
      .filter((m) => !plan || m.plan === plan)
      .filter((m) => !status || m.status === status)
      .sort(
        (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName),
      );
    return ok(paginate(items, page, limit));
  });
  route('GET', '/members/:id', ({ params }) => ok(findOr404(db.members, params['id'], 'Member')));
  route('POST', '/members', ({ body }) => {
    const input = parse(memberInputSchema, body);
    assertUniqueEmail(input.email);
    const member = {
      id: nextId(db, 'mem'),
      ...input,
      email: input.email.toLowerCase(),
      company: input.company === '' ? null : input.company,
      joinedAt: new Date(clock()).toISOString().slice(0, 10),
    };
    db.members.push(member);
    return created(member);
  });
  route('PATCH', '/members/:id', ({ params, body }) => {
    const member = findOr404(db.members, params['id'], 'Member');
    const input = parse(memberInputSchema, body);
    assertUniqueEmail(input.email, member.id);
    Object.assign(member, input, {
      email: input.email.toLowerCase(),
      company: input.company === '' ? null : input.company,
    });
    return ok(member);
  });
  route('DELETE', '/members/:id', ({ params }) => {
    const member = findOr404(db.members, params['id'], 'Member');
    if (
      hasUpcomingBookings(
        db.bookings.filter((b) => b.memberId === member.id),
        clock(),
      )
    ) {
      throw conflict('This member has upcoming bookings; cancel them first');
    }
    db.members = db.members.filter((m) => m.id !== member.id);
    return noContent();
  });

  // --- bookings ----------------------------------------------------------------------------------
  route('GET', '/bookings', ({ query }) => {
    const { page, limit, q, from, to, status, locationId, roomId, memberId } = parse(
      bookingListQuerySchema,
      cleanQuery(query),
    );
    const fromMs = from ? Date.parse(`${from}T00:00:00.000Z`) : -Infinity;
    const toMs = to ? Date.parse(`${to}T00:00:00.000Z`) + DAY : Infinity;
    const items = db.bookings
      .map(bookingView)
      .filter((b) => {
        const t = Date.parse(b.startsAt);
        return t >= fromMs && t < toMs;
      })
      .filter((b) => matches(q, b.memberName, b.roomName, b.locationName))
      .filter((b) => !status || b.status === status)
      .filter((b) => !locationId || b.locationId === locationId)
      .filter((b) => !roomId || b.roomId === roomId)
      .filter((b) => !memberId || b.memberId === memberId)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return ok(paginate(items, page, limit));
  });
  route('POST', '/bookings/bulk', ({ body }) => {
    const { ids, action } = parse(bulkBookingRequestSchema, body);
    const target: BookingStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
    const updated: string[] = [];
    const failed: { id: string; reason: string }[] = [];
    for (const id of ids) {
      const booking = db.bookings.find((b) => b.id === id);
      if (!booking) failed.push({ id, reason: 'Booking not found' });
      else if (!canTransition(booking.status, target)) {
        failed.push({
          id,
          reason: `Cannot ${action} a booking that is ${humanStatus(booking.status)}`,
        });
      } else {
        booking.status = target;
        updated.push(id);
      }
    }
    return ok({ updated, failed });
  });
  route('GET', '/bookings/:id', ({ params }) =>
    ok(bookingView(findOr404(db.bookings, params['id'], 'Booking'))),
  );
  route('POST', '/bookings', ({ body }) => {
    const input = parse(bookingInputSchema, body);
    const room = assertBookable(db, input);
    const booking: BookingRecord = {
      id: nextId(db, 'bk'),
      ...input,
      status: 'pending',
      totalPrice: bookingPrice(room, input.startsAt, input.endsAt),
      createdAt: new Date(clock()).toISOString(),
    };
    db.bookings.push(booking);
    return created(bookingView(booking));
  });
  route('PATCH', '/bookings/:id', ({ params, body }) => {
    const booking = findOr404(db.bookings, params['id'], 'Booking');
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      throw conflict('Only pending or confirmed bookings can be edited');
    }
    const input = parse(bookingInputSchema, body);
    const room = assertBookable(db, input, booking.id);
    Object.assign(booking, input, { totalPrice: bookingPrice(room, input.startsAt, input.endsAt) });
    return ok(bookingView(booking));
  });
  route('POST', '/bookings/:id/status', ({ params, body }) => {
    const booking = findOr404(db.bookings, params['id'], 'Booking');
    const { status } = parse(bookingStatusChangeSchema, body);
    if (!canTransition(booking.status, status)) {
      throw conflict(
        `Cannot change status from ${humanStatus(booking.status)} to ${humanStatus(status)}`,
      );
    }
    booking.status = status;
    return ok(bookingView(booking));
  });

  // --- dispatch ----------------------------------------------------------------------------------
  const authenticate = (authorization?: string | null) => {
    const token = authorization?.replace(/^Bearer\s+/i, '') ?? '';
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    return db.users.find((u) => u.id === token.slice(TOKEN_PREFIX.length)) ?? null;
  };

  const handle = (req: ApiRequest): ApiResponse => {
    const method = req.method.toUpperCase();
    try {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.pattern.exec(req.path);
        if (!m) continue;
        const user = authenticate(req.authorization);
        if (r.auth && !user) throw new HttpError(401, { message: 'Authentication required' });
        const params = Object.fromEntries(
          r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? '')]),
        );
        return r.handler({ params, query: req.query, body: req.body, user });
      }
      throw new HttpError(404, { message: `No route for ${method} ${req.path}` });
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: error.body };
      console.error(error);
      return { status: 500, body: { message: 'Internal server error' } };
    }
  };

  return {
    handle,
    reset: () => {
      db = createDb({ seed: options.seed, now: options.now ?? clock() });
    },
    get db() {
      return db;
    },
  };
};
