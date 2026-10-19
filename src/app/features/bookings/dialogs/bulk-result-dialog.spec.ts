import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet } from '@angular/router';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { provideTestSession } from '@testing/test-providers';
import type { BulkResultDialogData } from './bulk-result-dialog';
import { injectBulkResultDialog } from './open-bulk-result';

@Component({
  imports: [RouterOutlet],
  template: `
    <button type="button" (click)="open()">Show result</button>
    <router-outlet />
  `,
})
class Opener {
  data: BulkResultDialogData = { action: 'confirm', failures: [] };
  closed = 0;
  private readonly openResult = injectBulkResultDialog();
  async open() {
    await this.openResult(this.data);
    this.closed++;
  }
}

@Component({ template: '<p>A booking</p>' })
class Elsewhere {}

describe('BulkResultDialog', () => {
  // Opening it the first time fetches its chunk; doing that here keeps the cost out of the tests.
  beforeAll(async () => {
    await import('./bulk-result-dialog');
  });

  beforeEach(() => {
    installMockApi();
    signIn();
  });

  async function open(data: BulkResultDialogData) {
    const view = await render(Opener, {
      providers: provideTestSession([{ path: 'bookings/:id', component: Elsewhere }]),
    });
    view.fixture.componentInstance.data = data;
    await userEvent.click(screen.getByRole('button', { name: 'Show result' }));
    const dialog = await screen.findByRole('dialog');
    return { ...view, dialog };
  }

  const FAILURES: BulkResultDialogData['failures'] = [
    {
      id: 'bk_1',
      label: 'Aurora, 01 Jul 2026, 09:00–11:30',
      reason: 'Cannot confirm a booking that is completed',
    },
    { id: 'bk_2', label: 'bk_2', reason: 'Booking not found' },
  ];

  it.each([
    ['confirm', 'Some bookings were not confirmed'],
    ['cancel', 'Some bookings were not cancelled'],
  ] as const)('is titled for the action: %s', async (action, title) => {
    const { dialog } = await open({ action, failures: FAILURES });

    expect(dialog).toHaveAccessibleName(title);
  });

  it('lists each booking as a link to its page, with the server’s reason', async () => {
    const { dialog } = await open({ action: 'confirm', failures: FAILURES });

    const items = within(dialog).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(
      within(items[0]).getByRole('link', { name: 'Aurora, 01 Jul 2026, 09:00–11:30' }),
    ).toHaveAttribute('href', '/bookings/bk_1');
    expect(items[0]).toHaveTextContent('Cannot confirm a booking that is completed');
    expect(within(items[1]).getByRole('link', { name: 'bk_2' })).toHaveAttribute(
      'href',
      '/bookings/bk_2',
    );
    expect(items[1]).toHaveTextContent('Booking not found');
  });

  it('is 34rem wide', async () => {
    const { dialog } = await open({ action: 'confirm', failures: FAILURES });

    expect(dialog.closest('.cdk-overlay-pane')?.getAttribute('style')).toContain('width: 34rem');
  });

  it('puts focus on its only button, which closes it', async () => {
    const { dialog, fixture } = await open({ action: 'confirm', failures: FAILURES });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    await vi.waitFor(() => {
      expect(close).toHaveFocus();
    });

    await userEvent.click(close);

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(fixture.componentInstance.closed).toBe(1);
  });

  it('closes on Escape, and focus goes back to the button that opened it', async () => {
    await open({ action: 'confirm', failures: FAILURES });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });

    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show result' })).toHaveFocus();
    });
  });

  it('goes to the booking, and closes, when its link is followed', async () => {
    const { dialog } = await open({ action: 'cancel', failures: FAILURES });

    await userEvent.click(within(dialog).getByRole('link', { name: 'bk_2' }));

    await vi.waitFor(() => {
      expect(TestBed.inject(Router).url).toBe('/bookings/bk_2');
    });
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('stays open when the link is meant for another tab (Ctrl-click)', async () => {
    const { dialog, fixture } = await open({ action: 'cancel', failures: FAILURES });

    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(within(dialog).getByRole('link', { name: 'bk_2' }));
    await user.keyboard('{/Control}');
    await fixture.whenStable();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fixture.componentInstance.closed).toBe(0);
  });
});
