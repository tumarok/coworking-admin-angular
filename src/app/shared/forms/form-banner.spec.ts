import { render, screen } from '@testing-library/angular';
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
});
