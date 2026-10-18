import { render, screen } from '@testing-library/angular';
import { StatusChip } from './status-chip';
import { statusTone } from './status-tone';

describe('statusTone', () => {
  it.each([
    ['pending', 'warning'],
    ['confirmed', 'info'],
    ['checked_in', 'success'],
    ['completed', 'contrast'],
    ['cancelled', 'neutral'],
    ['no_show', 'danger'],
    ['active', 'success'],
    ['inactive', 'neutral'],
    ['suspended', 'warning'],
    ['available', 'success'],
    ['maintenance', 'warning'],
    ['retired', 'neutral'],
  ])('gives %s the %s tone', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });

  it('treats a status nobody has listed as neutral', () => {
    expect(statusTone('archived')).toBe('neutral');
  });
});

describe('StatusChip', () => {
  it('shows the status as readable text', async () => {
    await render(StatusChip, { inputs: { status: 'no_show' } });

    expect(screen.getByText('No show')).toBeInTheDocument();
  });

  it('carries the tone of the status as a class', async () => {
    const { container } = await render(StatusChip, { inputs: { status: 'confirmed' } });

    expect(container).toHaveClass('tone-info');
  });

  it('follows the status when it changes', async () => {
    const { container, fixture, rerender } = await render(StatusChip, {
      inputs: { status: 'pending' },
    });

    await rerender({ inputs: { status: 'checked_in' } });
    await fixture.whenStable();

    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(container).toHaveClass('tone-success');
  });
});
