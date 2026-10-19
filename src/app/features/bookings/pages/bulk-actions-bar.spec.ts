import type { BulkBookingAction } from '@shared/api/contract';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestApp } from '@testing/test-providers';
import { BulkActionsBar } from './bulk-actions-bar';

describe('BulkActionsBar', () => {
  async function open(inputs: { count: number; running?: BulkBookingAction }) {
    const runs: BulkBookingAction[] = [];
    const view = await render(BulkActionsBar, {
      inputs,
      on: {
        run: (action: BulkBookingAction) => {
          runs.push(action);
        },
      },
      providers: provideTestApp(),
    });
    return { ...view, runs };
  }

  it('says how many are selected, in a live region', async () => {
    const { rerender } = await open({ count: 3 });

    expect(screen.getByRole('status')).toHaveTextContent('3 selected');

    await rerender({ inputs: { count: 1 } });

    expect(screen.getByRole('status')).toHaveTextContent('1 selected');
  });

  it('keeps its live region, empty, with no buttons while nothing is selected', async () => {
    const { rerender } = await open({ count: 0 });
    const region = screen.getByRole('status');

    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await rerender({ inputs: { count: 2 } });

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('2 selected');
    expect(screen.getAllByRole('button')).toHaveLength(2);

    await rerender({ inputs: { count: 0 } });

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it('offers Confirm and Cancel, both enabled while nothing runs', async () => {
    await open({ count: 2 });

    expect(screen.getByRole('button', { name: 'Confirm selected bookings' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel selected bookings' })).toBeEnabled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('confirms at once, without asking', async () => {
    const { runs } = await open({ count: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'Confirm selected bookings' }));

    expect(runs).toEqual(['confirm']);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  describe('cancelling', () => {
    it('asks first, naming the number, with the safe answer in focus', async () => {
      const { runs } = await open({ count: 3 });

      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));

      const dialog = await screen.findByRole('alertdialog', { name: 'Cancel 3 bookings?' });
      expect(within(dialog).getByRole('button', { name: 'Cancel bookings' })).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(within(dialog).getByRole('button', { name: 'Keep' })).toHaveFocus();
      });
      expect(runs).toEqual([]);
    });

    it('says "booking" in the singular for one', async () => {
      await open({ count: 1 });

      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));

      expect(await screen.findByRole('alertdialog', { name: 'Cancel 1 booking?' })).toBeVisible();
    });

    it('goes ahead once the person agrees', async () => {
      const { runs } = await open({ count: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel bookings' }));

      await vi.waitFor(() => {
        expect(runs).toEqual(['cancel']);
      });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('sends nothing when the selection went while the question was open', async () => {
      const { runs, rerender } = await open({ count: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));
      const confirm = await screen.findByRole('button', { name: 'Cancel bookings' });

      await rerender({ inputs: { count: 0 } });
      await userEvent.click(confirm);

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(runs).toEqual([]);
    });

    it('does nothing when the person keeps the bookings, and focus returns to Cancel', async () => {
      const { runs } = await open({ count: 2 });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Keep' }));

      await vi.waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      expect(runs).toEqual([]);
      await vi.waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel selected bookings' })).toHaveFocus();
      });
    });
  });

  describe('while a request runs', () => {
    it.each(['confirm', 'cancel'] as const)(
      'disables both buttons and shows the progress of %s only',
      async (running) => {
        await open({ count: 2, running });

        const confirm = screen.getByRole('button', { name: 'Confirm selected bookings' });
        const cancel = screen.getByRole('button', { name: 'Cancel selected bookings' });
        expect(confirm).toHaveAttribute('aria-disabled', 'true');
        expect(cancel).toHaveAttribute('aria-disabled', 'true');
        const busy = running === 'confirm' ? confirm : cancel;
        const idle = running === 'confirm' ? cancel : confirm;
        expect(busy).toHaveAttribute('aria-busy', 'true');
        expect(within(busy).getByRole('progressbar')).toBeInTheDocument();
        expect(idle).not.toHaveAttribute('aria-busy');
        expect(within(idle).queryByRole('progressbar')).not.toBeInTheDocument();
      },
    );

    it('ignores clicks, and asks nothing', async () => {
      const { runs } = await open({ count: 2, running: 'confirm' });

      await userEvent.click(screen.getByRole('button', { name: 'Confirm selected bookings' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel selected bookings' }));

      expect(runs).toEqual([]);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
