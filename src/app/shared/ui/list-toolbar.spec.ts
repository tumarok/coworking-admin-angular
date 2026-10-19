import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ListToolbar } from './list-toolbar';

@Component({
  imports: [ListToolbar],
  template: `
    <app-list-toolbar
      label="Filter rooms"
      [filtersActive]="active()"
      (clearClick)="cleared = cleared + 1"
    >
      <input aria-label="Search" />
    </app-list-toolbar>
  `,
})
class Host {
  readonly active = signal(false);
  cleared = 0;
}

describe('ListToolbar', () => {
  it('is a named search region around the projected controls', async () => {
    await render(Host);

    const region = screen.getByRole('search', { name: 'Filter rooms' });
    expect(region).toContainElement(screen.getByRole('textbox', { name: 'Search' }));
  });

  it('has no Clear filters button while nothing narrows the list', async () => {
    await render(Host);

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('offers Clear filters once something does, and reports the click', async () => {
    const { fixture } = await render(Host);
    const host = fixture.componentInstance;
    host.active.set(true);
    await fixture.whenStable();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(host.cleared).toBe(1);
  });

  it('moves focus to the first control when Clear filters is used, as the button goes away', async () => {
    const { fixture } = await render(Host);
    const host = fixture.componentInstance;
    host.active.set(true);
    await fixture.whenStable();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
  });
});
