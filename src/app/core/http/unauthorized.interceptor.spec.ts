import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ON_UNAUTHORIZED } from './session-hooks';
import { SILENT } from './silent';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

describe('unauthorizedInterceptor', () => {
  let onUnauthorized: ReturnType<typeof vi.fn>;
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    onUnauthorized = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: ON_UNAUTHORIZED, useValue: onUnauthorized },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  function fail(url: string, status: number, options: { context?: HttpContext } = {}) {
    let caught: unknown;
    http.get(url, options).subscribe({ error: (e: unknown) => (caught = e) });
    controller.expectOne(url).flush({ message: 'No' }, { status, statusText: 'Error' });
    return caught;
  }

  it('reports a rejected token and still fails the request', () => {
    const caught = fail('/api/v1/rooms', 401);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(caught).toBeInstanceOf(HttpErrorResponse);
    expect((caught as HttpErrorResponse).status).toBe(401);
  });

  it('passes on the token the request carried', () => {
    http
      .get('/api/v1/rooms', { headers: { Authorization: 'Bearer demo-token.usr_admin' } })
      .subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/rooms').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith('demo-token.usr_admin');
  });

  it('passes on null when the request carried no token', () => {
    fail('/api/v1/rooms', 401);

    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('reports it for a silent request too, which has no session to continue with', () => {
    fail('/api/v1/rooms', 401, { context: new HttpContext().set(SILENT, true) });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('ignores other failures', () => {
    fail('/api/v1/rooms', 403);
    fail('/api/v1/rooms', 404);
    fail('/api/v1/rooms', 500);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ignores a wrong password: that 401 is the sign-in form’s to show', () => {
    fail('/api/v1/auth/login', 401);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ignores requests that are not to the API', () => {
    fail('https://cdn.example.test/data.json', 401);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('lets a successful response through', () => {
    let body: unknown;
    http.get('/api/v1/rooms').subscribe((b) => (body = b));

    controller.expectOne('/api/v1/rooms').flush({ items: [] });

    expect(body).toEqual({ items: [] });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('unauthorizedInterceptor without a session hook', () => {
  it('lets a 401 fail the request quietly', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    let caught: unknown;
    TestBed.inject(HttpClient)
      .get('/api/v1/rooms')
      .subscribe({ error: (e: unknown) => (caught = e) });

    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/rooms')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((caught as HttpErrorResponse).status).toBe(401);
  });
});
