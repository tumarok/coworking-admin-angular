import { render, screen } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import { FormBanner } from './form-banner';

describe('FormBanner', () => {
  it('draws nothing without a message', async () => {
    await render(FormBanner, { inputs: { messages: [] } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the messages in one alert', async () => {
    await render(FormBanner, { inputs: { messages: ['Remove the rooms first', 'Try again'] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Remove the rooms first');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again');
  });

  it('goes away when the messages do', async () => {
    const { rerender } = await render(FormBanner, { inputs: { messages: ['Conflict'] } });

    await rerender({ inputs: { messages: [] } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('with links', () => {
    const links = [
      { label: '14 Oct 2026, 09:00–10:00', link: ['/bookings', 'bk_1'] },
      { label: '14 Oct 2026, 10:00–11:00', link: '/bookings/bk_2' },
    ];

    it('lists each record as a link that opens in a new tab, below the message', async () => {
      await render(FormBanner, {
        inputs: { messages: ['The room is already booked for this time.'], links },
        providers: provideTestApp(),
      });

      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      const first = screen.getByRole('link', { name: /14 Oct 2026, 09:00–10:00/ });
      expect(first).toHaveAttribute('href', '/bookings/bk_1');
      expect(first).toHaveAttribute('target', '_blank');
      expect(first).toHaveAttribute('rel', 'noopener');
      expect(screen.getByRole('link', { name: /10:00–11:00/ })).toHaveAttribute(
        'href',
        '/bookings/bk_2',
      );
    });

    it('tells a screen reader that the links open a new tab', async () => {
      await render(FormBanner, {
        inputs: { messages: ['Booked.'], links },
        providers: provideTestApp(),
      });

      expect(
        screen.getByRole('link', { name: '14 Oct 2026, 09:00–10:00 (opens in a new tab)' }),
      ).toBeInTheDocument();
    });

    it('reads the message as the lead-in of the list, in bold', async () => {
      await render(FormBanner, {
        inputs: { messages: ['Booked.'], links },
        providers: provideTestApp(),
      });

      expect(screen.getByText('Booked.')).toHaveClass('lead');
    });

    it('keeps an ordinary message plain, and draws no list, without links', async () => {
      await render(FormBanner, { inputs: { messages: ['Booked.'] } });

      expect(screen.getByText('Booked.')).not.toHaveClass('lead');
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });
});
