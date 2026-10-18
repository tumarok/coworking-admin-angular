import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BYPASS_CACHE, CACHE_TAGS } from './cache-context';
import { CACHE_TTL_MS, CacheStore } from './cache-store';
import { cacheInterceptor } from './cache.interceptor';
import { TagRegistry } from './tag-registry';
import { idTag, listTag, type Tag } from './tags';

const ROOMS = '/api/v1/rooms';

describe('cacheInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let registry: TagRegistry;
  let cache: CacheStore;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([cacheInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    registry = TestBed.inject(TagRegistry);
    cache = TestBed.inject(CacheStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Sends a GET and flushes it when it reaches the network; resolves to the body. */
  function get(url: string, options: { tags?: Tag[]; bypass?: boolean; reply?: object } = {}) {
    const context = new HttpContext()
      .set(CACHE_TAGS, options.tags ?? [])
      .set(BYPASS_CACHE, options.bypass ?? false);
    let body: unknown;
    http.get(url, { context }).subscribe((b) => (body = b));
    const pending = controller.match(url);
    pending.forEach((req) => {
      req.flush(options.reply ?? { from: 'network' });
    });
    return { body: () => body, reachedNetwork: pending.length > 0 };
  }

  it('answers a repeated GET from the cache', () => {
    get(ROOMS, { reply: { n: 1 } });

    const second = get(ROOMS, { reply: { n: 2 } });

    expect(second.reachedNetwork).toBe(false);
    expect(second.body()).toEqual({ n: 1 });
  });

  it('tells apart URLs that differ only in their query string', () => {
    get(`${ROOMS}?page=1`);

    expect(get(`${ROOMS}?page=2`).reachedNetwork).toBe(true);
    expect(get(`${ROOMS}?page=1`).reachedNetwork).toBe(false);
  });

  it('asks the network again once the entry is older than the TTL', () => {
    get(ROOMS, { reply: { n: 1 } });

    vi.advanceTimersByTime(CACHE_TTL_MS - 1);
    expect(get(ROOMS).reachedNetwork).toBe(false);

    vi.advanceTimersByTime(1);
    const stale = get(ROOMS, { reply: { n: 2 } });
    expect(stale.reachedNetwork).toBe(true);
    expect(stale.body()).toEqual({ n: 2 });
  });

  it('asks the network again after one of the entry’s tags is invalidated', () => {
    const tags = [listTag('Room'), idTag('Room', 'room_1')];
    get(ROOMS, { tags });

    registry.invalidate([idTag('Room', 'room_1')]);

    expect(get(ROOMS, { tags }).reachedNetwork).toBe(true);
  });

  it('does not hand an entry to a request that has other tags', () => {
    get(ROOMS, { tags: [listTag('Room')] });

    expect(get(ROOMS, { tags: [idTag('Room', 'room_1')] }).reachedNetwork).toBe(true);
    expect(get(ROOMS, { tags: [listTag('Room'), listTag('Member')] }).reachedNetwork).toBe(true);
  });

  it('does not share a request in flight with one that has other tags', () => {
    http.get(ROOMS, { context: new HttpContext().set(CACHE_TAGS, [listTag('Room')]) }).subscribe();
    http
      .get(ROOMS, { context: new HttpContext().set(CACHE_TAGS, [listTag('Member')]) })
      .subscribe();

    expect(controller.match(ROOMS)).toHaveLength(2);
  });

  it('stores JSON answers only', () => {
    http.get(ROOMS, { responseType: 'text' }).subscribe();
    controller.expectOne(ROOMS).flush('plain');

    expect(cache.size).toBe(0);
    expect(get(ROOMS).reachedNetwork).toBe(true);
  });

  it('keeps the entry when only other tags are invalidated', () => {
    get(ROOMS, { tags: [listTag('Room')] });

    registry.invalidate([listTag('Member'), idTag('Room', 'room_1')]);

    expect(get(ROOMS, { tags: [listTag('Room')] }).reachedNetwork).toBe(false);
  });

  it('skips the cache on request and replaces the entry with the fresh answer', () => {
    get(ROOMS, { reply: { n: 1 } });

    const refreshed = get(ROOMS, { bypass: true, reply: { n: 2 } });

    expect(refreshed.reachedNetwork).toBe(true);
    expect(get(ROOMS).body()).toEqual({ n: 2 });
  });

  it('makes parallel identical requests share one network call', () => {
    const bodies: unknown[] = [];
    http.get(ROOMS).subscribe((b) => bodies.push(b));
    http.get(ROOMS).subscribe((b) => bodies.push(b));

    controller.expectOne(ROOMS).flush({ n: 1 });

    expect(bodies).toEqual([{ n: 1 }, { n: 1 }]);
  });

  it('does not share a request that was started before an invalidation', () => {
    const tags = [listTag('Room')];
    http.get(ROOMS, { context: new HttpContext().set(CACHE_TAGS, tags) }).subscribe();
    registry.invalidate(tags);

    http.get(ROOMS, { context: new HttpContext().set(CACHE_TAGS, tags) }).subscribe();

    expect(controller.match(ROOMS)).toHaveLength(2);
  });

  it('does not store the answer that was overtaken by an invalidation', () => {
    const tags = [listTag('Room')];
    http.get(ROOMS, { context: new HttpContext().set(CACHE_TAGS, tags) }).subscribe();
    registry.invalidate(tags);
    controller.expectOne(ROOMS).flush({ n: 'stale' });

    expect(get(ROOMS, { tags }).reachedNetwork).toBe(true);
  });

  it('never stores a failure', () => {
    let error: unknown;
    http.get(ROOMS).subscribe({ error: (e: unknown) => (error = e) });
    controller.expectOne(ROOMS).flush({ message: 'Down' }, { status: 500, statusText: 'Error' });

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(cache.size).toBe(0);
    expect(get(ROOMS).reachedNetwork).toBe(true);
  });

  it('lets a failed shared request fail every subscriber, then try again', () => {
    const errors: unknown[] = [];
    http.get(ROOMS).subscribe({ error: (e: unknown) => errors.push(e) });
    http.get(ROOMS).subscribe({ error: (e: unknown) => errors.push(e) });
    controller.expectOne(ROOMS).flush(null, { status: 500, statusText: 'Error' });

    expect(errors).toHaveLength(2);
    expect(get(ROOMS).reachedNetwork).toBe(true);
  });

  it('keeps a shared request alive until its last subscriber leaves', () => {
    const first = http.get(ROOMS).subscribe();
    let body: unknown;
    http.get(ROOMS).subscribe((b) => (body = b));
    first.unsubscribe();

    const request = controller.expectOne(ROOMS);
    expect(request.cancelled).toBe(false);
    request.flush({ n: 1 });
    expect(body).toEqual({ n: 1 });
  });

  it('cancels the request when nobody waits for it any more', () => {
    http.get(ROOMS).subscribe().unsubscribe();

    expect(controller.expectOne(ROOMS).cancelled).toBe(true);
    expect(get(ROOMS).reachedNetwork).toBe(true);
  });

  it('forgets everything on clear, even an answer that arrives later', () => {
    get(ROOMS);
    http.get('/api/v1/members').subscribe();

    cache.clear();
    controller.expectOne('/api/v1/members').flush({ n: 1 });

    expect(cache.size).toBe(0);
    expect(get(ROOMS).reachedNetwork).toBe(true);
    expect(get('/api/v1/members').reachedNetwork).toBe(true);
  });

  it('drops expired and invalidated entries when it stores a new one', () => {
    get('/api/v1/rooms/1', { tags: [idTag('Room', '1')] });
    get('/api/v1/rooms/2');
    expect(cache.size).toBe(2);

    registry.invalidate([idTag('Room', '1')]);
    get('/api/v1/rooms/3');
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(CACHE_TTL_MS);
    get('/api/v1/rooms/4');
    expect(cache.size).toBe(1);
  });

  it('leaves writes alone', () => {
    http.post(ROOMS, {}).subscribe();
    controller.expectOne(ROOMS).flush({});

    expect(cache.size).toBe(0);
    http.post(ROOMS, {}).subscribe();
    controller.expectOne(ROOMS).flush({});
  });

  it('leaves requests to other hosts alone', () => {
    const url = 'https://cdn.example.test/data.json';
    get(url);

    expect(cache.size).toBe(0);
    expect(get(url).reachedNetwork).toBe(true);
  });
});
