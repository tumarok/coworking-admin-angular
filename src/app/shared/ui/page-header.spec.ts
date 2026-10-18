import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <app-page-header title="Rooms" subtitle="All rooms" [back]="{ label: 'Back', link: '/lists' }">
      <button type="button">Add room</button>
    </app-page-header>
  `,
})
class Host {}

describe('PageHeader', () => {
  it('shows the title as the page heading', async () => {
    await render(PageHeader, { inputs: { title: 'Rooms' }, providers: provideTestApp() });

    expect(screen.getByRole('heading', { level: 1, name: 'Rooms' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the subtitle, the link back and the projected actions', async () => {
    await render(Host, { providers: provideTestApp() });

    expect(screen.getByText('All rooms')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/lists');
    expect(screen.getByRole('button', { name: 'Add room' })).toBeInTheDocument();
  });
});
