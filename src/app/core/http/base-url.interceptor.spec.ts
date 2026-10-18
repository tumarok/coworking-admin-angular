import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, API_ENDPOINT } from './api-url';
import { baseUrlInterceptor } from './base-url.interceptor';

describe('baseUrlInterceptor', () => {
  const endpoint = new HttpContext().set(API_ENDPOINT, true);

  function setup(baseUrl?: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([baseUrlInterceptor])),
        provideHttpClientTesting(),
        ...(baseUrl ? [{ provide: API_BASE_URL, useValue: baseUrl }] : []),
      ],
    });
    return { http: TestBed.inject(HttpClient), controller: TestBed.inject(HttpTestingController) };
  }

  it('sends an endpoint path to /api/v1 by default', () => {
    const { http, controller } = setup();

    http.get('/rooms', { context: endpoint }).subscribe();

    controller.expectOne('/api/v1/rooms');
  });

  it('uses the configured base URL', () => {
    const { http, controller } = setup('https://api.example.test/v2');

    http.get('/rooms', { context: endpoint }).subscribe();

    controller.expectOne('https://api.example.test/v2/rooms');
  });

  it('leaves alone a request that is not marked as an endpoint', () => {
    const { http, controller } = setup();

    http.get('/assets/logo.svg').subscribe();
    http.get('/rooms').subscribe();

    controller.expectOne('/assets/logo.svg');
    controller.expectOne('/rooms');
  });

  it('does not touch a marked URL that already is complete', () => {
    const { http, controller } = setup();

    http.get('https://cdn.example.test/logo.svg', { context: endpoint }).subscribe();
    http.get('/api/v1/members', { context: endpoint }).subscribe();

    controller.expectOne('https://cdn.example.test/logo.svg');
    controller.expectOne('/api/v1/members');
  });
});
