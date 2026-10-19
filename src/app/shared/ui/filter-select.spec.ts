import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideTestMaterial } from '@testing/test-providers';
import { FilterSelect } from './filter-select';
import type { SelectOption } from './select-option';

const OPTIONS: SelectOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

@Component({
  imports: [FilterSelect],
  template: `
    <app-filter-select
      label="Status"
      anyLabel="Any status"
      [options]="options"
      [value]="value()"
      (valueChange)="chosen.push($event)"
    />
  `,
})
class Host {
  readonly options = OPTIONS;
  readonly value = signal<string | undefined>(undefined);
  readonly chosen: (string | undefined)[] = [];
}

describe('FilterSelect', () => {
  async function open() {
    const view = await render(Host, { providers: [provideTestMaterial()] });
    const host = view.fixture.componentInstance;
    const select = () => screen.getByRole('combobox', { name: 'Status' });
    return { ...view, host, select };
  }

  it('is a dropdown named by its label, showing the "any" entry when no filter is set', async () => {
    const { select } = await open();

    await vi.waitFor(() => {
      expect(select()).toHaveTextContent('Any status');
    });
  });

  it('lists the "any" entry first, then the options', async () => {
    const { select } = await open();

    await userEvent.click(select());

    expect(screen.getAllByRole('option').map((o) => o.textContent.trim())).toEqual([
      'Any status',
      'Active',
      'Inactive',
    ]);
  });

  it('reports the chosen value', async () => {
    const { host, select } = await open();

    await userEvent.click(select());
    await userEvent.click(screen.getByRole('option', { name: 'Inactive' }));

    expect(host.chosen).toEqual(['inactive']);
  });

  it('reports undefined for the "any" entry', async () => {
    const { host, select, fixture } = await open();
    host.value.set('active');
    await fixture.whenStable();
    expect(select()).toHaveTextContent('Active');

    await userEvent.click(select());
    await userEvent.click(screen.getByRole('option', { name: 'Any status' }));

    expect(host.chosen).toEqual([undefined]);
  });

  it('shows the value it is given', async () => {
    const { host, select, fixture } = await open();

    host.value.set('inactive');
    await fixture.whenStable();

    expect(select()).toHaveTextContent('Inactive');
  });
});
