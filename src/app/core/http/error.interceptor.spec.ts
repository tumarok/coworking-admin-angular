import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { Notifier } from '@core/notifications/notifier';
import { NETWORK_ERROR_MESSAGE } from '@shared/api/api-error';
import { errorInterceptor, SESSION_EXPIRED_MESSAGE } from './error.interceptor';
import { SILENT } from './silent';

describe('errorInterceptor', () => {
  let notifier: { error: ReturnType<typeof vi.fn> };
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    notifier = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: notifier },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  function fail(url: string, status: number, body: object | string, context?: HttpContext) {
    let caught: unknown;
    http.get(url, { context }).subscribe({ error: (e: unknown) => (caught = e) });
    controller.expectOne(url).flush(body, { status, statusText: 'Error' });
    return caught;
  }

  it('shows the message of the server and still fails the request', () => {
    const caught = fail('/api/v1/rooms/x', 404, { message: 'Room not found' });

    expect(notifier.error).toHaveBeenCalledExactlyOnceWith('Room not found');
    expect((caught as HttpErrorResponse).status).toBe(404);
  });

  it('shows a generic text when the server sent no message', () => {
    fail('/api/v1/rooms', 502, 'Bad gateway');

    expect(notifier.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
  });

  it('says so when the server cannot be reached', () => {
    http.get('/api/v1/rooms').subscribe({ error: () => undefined });

    controller.expectOne('/api/v1/rooms').error(new ProgressEvent('error'));

    expect(notifier.error).toHaveBeenCalledWith(NETWORK_ERROR_MESSAGE);
  });

  it('says that the session has expired on a 401', () => {
    fail('/api/v1/rooms', 401, { message: 'Authentication required' });

    expect(notifier.error).toHaveBeenCalledWith(SESSION_EXPIRED_MESSAGE);
  });

  it('shows the server’s reason for a rejected sign-in', () => {
    fail('/api/v1/auth/login', 401, { message: 'Invalid email or password' });

    expect(notifier.error).toHaveBeenCalledWith('Invalid email or password');
  });

  it('stays quiet for a silent request, but the failure still reaches the caller', () => {
    const caught = fail(
      '/api/v1/rooms',
      422,
      { message: 'Validation failed' },
      new HttpContext().set(SILENT, true),
    );

    expect(notifier.error).not.toHaveBeenCalled();
    expect((caught as HttpErrorResponse).status).toBe(422);
  });

  it('stays quiet for requests that are not to the API', () => {
    fail('https://cdn.example.test/data.json', 500, { message: 'Down' });

    expect(notifier.error).not.toHaveBeenCalled();
  });

  it('leaves a failure that is not an HTTP response to whoever handles it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([errorInterceptor, () => throwError(() => new Error('boom'))]),
        ),
        { provide: Notifier, useValue: notifier },
      ],
    });
    let caught: unknown;

    TestBed.inject(HttpClient)
      .get('/api/v1/rooms')
      .subscribe({ error: (e: unknown) => (caught = e) });

    expect(caught).toEqual(new Error('boom'));
    expect(notifier.error).not.toHaveBeenCalled();
  });

  it('stays quiet for a success', () => {
    http.get('/api/v1/rooms').subscribe();

    controller.expectOne('/api/v1/rooms').flush({ items: [] });

    expect(notifier.error).not.toHaveBeenCalled();
  });
});
