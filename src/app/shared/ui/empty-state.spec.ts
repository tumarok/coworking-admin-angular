import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state title="Room not found" message="It may have been deleted." icon="error">
      <a href="/rooms">Back to rooms</a>
    </app-empty-state>
  `,
})
class Host {}

describe('EmptyState', () => {
  it('shows the title as a heading', async () => {
    await render(EmptyState, { inputs: { title: 'No rooms yet' } });

    expect(screen.getByRole('heading', { level: 2, name: 'No rooms yet' })).toBeInTheDocument();
  });

  it('shows the message and the projected next step', async () => {
    await render(Host);

    expect(screen.getByText('It may have been deleted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to rooms' })).toBeInTheDocument();
  });

  it('is the page heading when it is the whole page', async () => {
    await render(EmptyState, { inputs: { title: 'Page not found', headingLevel: 1 } });

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });

  it('has no message paragraph unless one is given', async () => {
    const { container } = await render(EmptyState, { inputs: { title: 'Nothing' } });

    expect(container.querySelector('p')).toBeNull();
  });
});
