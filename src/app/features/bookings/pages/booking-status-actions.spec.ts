import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { injectBookingQuery } from '../data/booking-queries';
import { BookingStatusActions } from './booking-status-actions';

/** The booking as a page holds it: loaded by id, and loaded again when a move makes it stale. */
@Component({
  imports: [BookingStatusActions],
  template: `
    @if (query.value(); as booking) {
      <p>Status: {{ booking.status }}</p>
      <app-booking-status-actions [booking]="booking" />
    }
  `,
})
class Host {
  readonly id = input.required<string>();
  protected readonly query = injectBookingQuery(() => this.id());
}

describe('BookingStatusActions', () => {
  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET')
        requests.push(`${request.method} ${new URL(request.url).pathname.replace('/api/v1', '')}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  const withStatus = (status: string) => {
    const booking = api.db.bookings.find((b) => b.status === status);
    if (!booking) throw new Error(`seed has no ${status} booking`);
    return booking;
  };
  /** The booking as the API stores it, to change behind the page's back. */
  const stored = (id: string) => {
    const booking = api.db.bookings.find((b) => b.id === id);
    if (!booking) throw new Error('no such booking');
    return booking;
  };
  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');
  const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent.trim());

  async function open(id: string) {
    const view = await render(Host, {
      providers: provideTestSession(),
      inputs: { id },
    });
    await screen.findByText(/^Status: /);
    return view;
  }

  describe('the buttons', () => {
    it.each([
      ['pending', ['Confirm', 'Cancel booking']],
      ['confirmed', ['Check in', 'Cancel booking', 'No-show']],
      ['checked_in', ['Complete']],
      ['completed', []],
      ['cancelled', []],
      ['no_show', []],
    ])('shows, for a %s booking, %j', async (status, expected) => {
      await open(withStatus(status).id);

      expect(buttons()).toEqual(expected);
    });
  });

  describe('a move without a question', () => {
    it.each([
      ['pending', 'Confirm', 'confirmed', 'Booking confirmed'],
      ['confirmed', 'Check in', 'checked_in', 'Booking checked in'],
      ['checked_in', 'Complete', 'completed', 'Booking completed'],
      ['confirmed', 'No-show', 'no_show', 'Booking no show'],
    ])('moves a %s booking with %s to %s, and says so', async (from, label, to, said) => {
      const booking = withStatus(from);
      await open(booking.id);

      await userEvent.click(screen.getByRole('button', { name: label }));

      await vi.waitFor(() => {
        expect(screen.getByText(`Status: ${to}`)).toBeInTheDocument();
      });
      expect(api.db.bookings.find((b) => b.id === booking.id)?.status).toBe(to);
      expect(requests).toEqual([`POST /bookings/${booking.id}/status`]);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(said);
    });

    it('sends the status the button leads to', async () => {
      const booking = withStatus('pending');
      let body: unknown;
      server.use(
        http.post(apiUrl('/bookings/:id/status'), async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({
            ...booking,
            roomName: 'x',
            locationId: '',
            locationName: '—',
            memberName: 'x',
            status: 'confirmed',
          });
        }),
      );
      await open(booking.id);

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(body).toEqual({ status: 'confirmed' });
      });
    });

    it('shows the buttons of the new status once the booking has reloaded', async () => {
      await open(withStatus('pending').id);

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(buttons()).toEqual(['Check in', 'Cancel booking', 'No-show']);
      });
    });

    it('moves focus to the first button of the new status, as the pressed one is gone', async () => {
      await open(withStatus('pending').id);

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check in' })).toHaveFocus();
      });
    });

    it('leaves focus alone when the booking has no move left', async () => {
      await open(withStatus('checked_in').id);

      await userEvent.click(screen.getByRole('button', { name: 'Complete' }));

      await vi.waitFor(() => {
        expect(buttons()).toEqual([]);
      });
    });
  });

  describe('cancelling', () => {
    it('asks first, and keeps the booking when the answer is Keep', async () => {
      const booking = withStatus('pending');
      await open(booking.id);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this booking?' });
      expect(dialog).toHaveAccessibleDescription('The room becomes available for this time again.');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Keep' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(requests).toEqual([]);
      expect(api.db.bookings.find((b) => b.id === booking.id)?.status).toBe('pending');
    });

    it('starts the question on Keep, the safe answer', async () => {
      await open(withStatus('pending').id);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));

      const dialog = await screen.findByRole('alertdialog');
      await vi.waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveFocus();
      });
    });

    it('cancels the booking once it is confirmed, and says so', async () => {
      const booking = withStatus('confirmed');
      await open(booking.id);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
      const dialog = await screen.findByRole('alertdialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));

      await vi.waitFor(() => {
        expect(screen.getByText('Status: cancelled')).toBeInTheDocument();
      });
      expect(requests).toEqual([`POST /bookings/${booking.id}/status`]);
      await vi.waitFor(() => {
        expect(snackbars()[0]).toHaveTextContent('Booking cancelled');
      });
      expect(buttons()).toEqual([]);
    });
  });

  describe('while a move runs', () => {
    beforeEach(() => {
      server.use(
        http.post(apiUrl('/bookings/:id/status'), async ({ params }) => {
          await delay(200);
          const booking = api.db.bookings.find((b) => b.id === params['id']);
          if (!booking) return new HttpResponse(null, { status: 404 });
          booking.status = 'confirmed';
          return HttpResponse.json({
            ...booking,
            roomName: 'Room',
            locationId: 'loc_1',
            locationName: 'Place',
            memberName: 'Someone',
          });
        }),
      );
    });

    it('shows the pressed button as busy and disables the others', async () => {
      await open(withStatus('pending').id);

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      const confirm = screen.getByRole('button', { name: 'Confirm' });
      expect(confirm).toHaveAttribute('aria-busy', 'true');
      expect(confirm).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
      expect(within(confirm).getByRole('progressbar')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      });
    });

    it('sends one request however often the pressed button is pressed', async () => {
      await open(withStatus('pending').id);

      const confirm = screen.getByRole('button', { name: 'Confirm' });
      await userEvent.click(confirm);
      await userEvent.click(confirm);
      await userEvent.click(confirm);

      await vi.waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
      });
      expect(requests).toHaveLength(1);
    });

    it('is not busy before a move, and is again not busy after it', async () => {
      await open(withStatus('pending').id);
      expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveAttribute('aria-busy');
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeEnabled();

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Check in' })).toBeEnabled();
      });
      expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeEnabled();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('when the server refuses (409)', () => {
    it('tells the person why in a snackbar, and leaves the buttons as they were', async () => {
      const booking = withStatus('pending');
      await open(booking.id);
      // Someone else completed it meanwhile: the move is no longer possible.
      stored(booking.id).status = 'cancelled';

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Cannot change status from cancelled to confirmed');
      expect(buttons()).toEqual(['Confirm', 'Cancel booking']);
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeEnabled();
      });
      expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveAttribute('aria-busy');
    });

    it('does not say the move went through', async () => {
      const booking = withStatus('pending');
      await open(booking.id);
      stored(booking.id).status = 'completed';

      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).not.toHaveTextContent('Booking confirmed');
    });

    it('can be tried again once the cause is gone', async () => {
      const booking = withStatus('pending');
      await open(booking.id);
      stored(booking.id).status = 'cancelled';
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });

      stored(booking.id).status = 'pending';
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await vi.waitFor(() => {
        expect(screen.getByText('Status: confirmed')).toBeInTheDocument();
      });
    });
  });
});
