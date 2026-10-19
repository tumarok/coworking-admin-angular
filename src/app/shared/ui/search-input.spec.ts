import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { SearchInput } from './search-input';

@Component({
  imports: [SearchInput],
  template: `
    <app-search-input
      label="Search rooms"
      [value]="value()"
      [delay]="50"
      (searchChange)="reported.push($event)"
    />
  `,
})
class Host {
  readonly value = signal('');
  readonly reported: string[] = [];
}

describe('SearchInput', () => {
  async function open(value = '') {
    const view = await render(Host);
    const host = view.fixture.componentInstance;
    host.value.set(value);
    await view.fixture.whenStable();
    const box = () => screen.getByRole('searchbox', { name: 'Search rooms' });
    return { ...view, host, box };
  }

  it('is a search box named by its label, which is also its placeholder', async () => {
    const { box } = await open();

    expect(box()).toHaveAttribute('placeholder', 'Search rooms');
  });

  it('shows the search the list has', async () => {
    const { box } = await open('lisbon');

    expect(box()).toHaveValue('lisbon');
  });

  it('reports the text once typing pauses, not per keystroke', async () => {
    const { host, box } = await open();

    await userEvent.type(box(), 'kyiv');
    expect(host.reported).toEqual([]);

    await vi.waitFor(() => {
      expect(host.reported).toEqual(['kyiv']);
    });
  });

  it('reports at once on Enter and trims the text', async () => {
    const { host, box } = await open();

    await userEvent.type(box(), '  kyiv {Enter}');

    expect(host.reported).toEqual(['kyiv']);
  });

  it('reports when focus leaves the box', async () => {
    const { host, box } = await open();

    await userEvent.type(box(), 'kyiv');
    await userEvent.tab();

    expect(host.reported).toEqual(['kyiv']);
  });

  it('reports nothing for text that is the search already', async () => {
    const { host, box } = await open('kyiv');

    await userEvent.type(box(), '{Enter}');
    await userEvent.type(box(), ' {Enter}');

    expect(host.reported).toEqual([]);
  });

  it('reports an emptied box, so the search can be cleared', async () => {
    const { host, box } = await open('kyiv');

    await userEvent.clear(box());
    await userEvent.tab();

    expect(host.reported).toEqual(['']);
  });

  it('takes the text of a search changed elsewhere, such as clearing the filters', async () => {
    const { host, box, fixture } = await open('kyiv');

    host.value.set('');
    await fixture.whenStable();

    expect(box()).toHaveValue('');
  });

  it('keeps what is being typed when the list catches up with an earlier report', async () => {
    const { host, box, fixture } = await open();
    await userEvent.type(box(), 'kyiv{Enter}');

    await userEvent.type(box(), 'x');
    host.value.set('kyiv');
    await fixture.whenStable();

    expect(box()).toHaveValue('kyivx');
  });

  it('shows a search that comes back, such as the Back button after clearing the filters', async () => {
    const { host, box, fixture } = await open();
    await userEvent.type(box(), 'kyiv{Enter}');
    host.value.set('kyiv');
    await fixture.whenStable();

    host.value.set('');
    await fixture.whenStable();
    expect(box()).toHaveValue('');
    host.value.set('kyiv');
    await fixture.whenStable();

    expect(box()).toHaveValue('kyiv');
  });

  it('does not report after it is gone', async () => {
    const { host, box, fixture } = await open();
    await userEvent.type(box(), 'kyiv');

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(host.reported).toEqual([]);
  });
});
