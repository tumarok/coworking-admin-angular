import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { provideTestApp } from './test-providers';

describe('provideTestApp', () => {
  it('runs change detection without zone.js', () => {
    expect((globalThis as { Zone?: unknown }).Zone).toBeUndefined();
  });

  it('registers the given routes', () => {
    TestBed.configureTestingModule({
      providers: provideTestApp([{ path: 'rooms', children: [] }]),
    });

    expect(TestBed.inject(Router).config.map((route) => route.path)).toEqual(['rooms']);
  });

  it('serves HTTP calls from the testing controller', async () => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    const controller = TestBed.inject(HttpTestingController);

    const response = firstValueFrom(TestBed.inject(HttpClient).get('/api/ping'));
    controller.expectOne('/api/ping').flush({ ok: true });

    expect(await response).toEqual({ ok: true });
    controller.verify();
  });
});
