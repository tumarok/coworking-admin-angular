import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { ACCESS_TOKEN } from './session-hooks';

describe('authInterceptor', () => {
  let token: string | null;
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    token = 'demo-token.usr_admin';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ACCESS_TOKEN, useValue: () => token },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  it('sends the bearer token with API requests', () => {
    http.get('/api/v1/rooms').subscribe();

    const req = controller.expectOne('/api/v1/rooms');
    expect(req.request.headers.get('Authorization')).toBe('Bearer demo-token.usr_admin');
  });

  it('reads the token again for every request', () => {
    http.get('/api/v1/rooms').subscribe();
    token = 'demo-token.usr_manager';
    http.get('/api/v1/members').subscribe();

    expect(controller.expectOne('/api/v1/rooms').request.headers.get('Authorization')).toBe(
      'Bearer demo-token.usr_admin',
    );
    expect(controller.expectOne('/api/v1/members').request.headers.get('Authorization')).toBe(
      'Bearer demo-token.usr_manager',
    );
  });

  it('sends no header when nobody is signed in', () => {
    token = null;

    http.get('/api/v1/auth/login').subscribe();

    expect(controller.expectOne('/api/v1/auth/login').request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('keeps the token away from other hosts and static files', () => {
    http.get('https://cdn.example.test/data.json').subscribe();
    http.get('/assets/logo.svg').subscribe();

    expect(
      controller
        .expectOne('https://cdn.example.test/data.json')
        .request.headers.has('Authorization'),
    ).toBe(false);
    expect(controller.expectOne('/assets/logo.svg').request.headers.has('Authorization')).toBe(
      false,
    );
  });
});

describe('authInterceptor without a session', () => {
  it('sends no token by default', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(HttpClient).get('/api/v1/rooms').subscribe();

    const req = TestBed.inject(HttpTestingController).expectOne('/api/v1/rooms');

    expect(req.request.headers.has('Authorization')).toBe(false);
  });
});
