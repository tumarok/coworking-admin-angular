import { HttpClient, HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { ApiErrorBody, Booking, LoginResponse, Location, Page } from '@shared/api/contract';
import { firstValueFrom } from 'rxjs';
import { findBookedSlot, installMockApi, signIn, TEST_NOW } from './mock-api';
import { apiUrl } from './msw-server';

describe('mock API under HttpClient', () => {
  let http: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    http = TestBed.inject(HttpClient);
  });

  it('signs in with the demo account', async () => {
    installMockApi();

    const response = await firstValueFrom(
      http.post<LoginResponse>(apiUrl('/auth/login'), {
        email: 'admin@coworking.test',
        password: 'demo1234',
      }),
    );

    expect(response.token).toBe('demo-token.usr_admin');
    expect(response.user.role).toBe('admin');
  });

  it('lists a page of locations for a signed-in user', async () => {
    installMockApi();
    signIn();

    const page = await firstValueFrom(
      http.get<Page<Location>>(apiUrl('/locations'), {
        params: { limit: 2 },
        headers: { Authorization: `Bearer ${sessionStorage.getItem('coworking-admin.token')}` },
      }),
    );

    expect(page.items).toHaveLength(2);
    expect(page.limit).toBe(2);
  });

  it('answers 401 with the error body when the token is missing', async () => {
    installMockApi();

    const error = await firstValueFrom(http.get(apiUrl('/locations'))).catch(
      (e: unknown) => e as HttpErrorResponse,
    );

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(401);
    expect((error as HttpErrorResponse).error).toEqual({ message: 'Authentication required' });
  });

  it('reports an overlapping booking as 409 with the conflicts', async () => {
    const api = installMockApi();
    signIn();
    const { existing, room, member } = findBookedSlot(api);

    const error = await firstValueFrom(
      http.post<Booking>(
        apiUrl('/bookings'),
        {
          roomId: room.id,
          memberId: member.id,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          attendees: 1,
          notes: '',
        },
        { headers: { Authorization: 'Bearer demo-token.usr_admin' } },
      ),
    ).catch((e: unknown) => e as HttpErrorResponse);

    expect((error as HttpErrorResponse).status).toBe(409);
    expect(((error as HttpErrorResponse).error as ApiErrorBody).conflicts?.[0]?.id).toBe(
      existing.id,
    );
    expect(Date.parse(existing.startsAt)).toBeGreaterThan(TEST_NOW);
  });

  it('fails a request that no handler claims', async () => {
    const request = firstValueFrom(http.get('http://localhost/elsewhere'));

    await expect(request).rejects.toBeInstanceOf(HttpErrorResponse);
  });
});
