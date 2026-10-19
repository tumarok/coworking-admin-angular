import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, type Routes, RouterOutlet } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { firstValueFrom } from 'rxjs';
import { provideTestApp, provideTestSession } from './test-providers';

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

  it.each([
    ['provideTestApp', (routes: Routes) => provideTestApp(routes)],
    ['provideTestSession', (routes: Routes) => provideTestSession(routes)],
  ])('%s binds route and query parameters to inputs, as the app does', async (_name, provide) => {
    @Component({ template: '{{ id() }} {{ tab() }}' })
    class Page {
      readonly id = input<string>();
      readonly tab = input<string>();
    }
    @Component({ imports: [RouterOutlet], template: '<router-outlet />' })
    class Outlet {}
    await render(Outlet, { providers: provide([{ path: 'rooms/:id', component: Page }]) });

    await TestBed.inject(Router).navigateByUrl('/rooms/room_1?tab=info');

    expect(await screen.findByText('room_1 info')).toBeInTheDocument();
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
