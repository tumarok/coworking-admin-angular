import { SelectionModel } from '@angular/cdk/collections';
import { Component } from '@angular/core';
import { render, screen, within } from '@testing-library/angular';
import { provideTestApp } from '@testing/test-providers';
import userEvent from '@testing-library/user-event';
import { type DataTableColumn, DataTable, type TablePageChange } from './data-table';
import { DataTableCell } from './data-table-cell';
import { StatusChip } from './status-chip';

interface Row {
  id: string;
  name: string;
  status: string;
}

const rows: Row[] = [
  { id: 'a', name: 'Atlas', status: 'active' },
  { id: 'b', name: 'Birch', status: 'inactive' },
  { id: 'c', name: 'Cedar', status: 'active' },
];

const columns: DataTableColumn<Row>[] = [
  {
    key: 'name',
    header: 'Name',
    value: (r) => r.name,
    link: (r) => (r.id === 'c' ? undefined : ['/rooms', r.id]),
  },
  { key: 'id', header: 'Code', value: (r) => r.id.toUpperCase(), nowrap: true },
  { key: 'status', header: 'Status' },
  { key: 'actions', header: 'Actions', hideHeader: true, value: () => '' },
];

@Component({
  imports: [DataTable, DataTableCell, StatusChip],
  template: `
    <app-data-table
      caption="Rooms"
      [columns]="columns"
      [rows]="rows"
      [total]="total"
      [page]="page"
      [limit]="limit"
      [fetching]="fetching"
      [error]="error"
      [emptyMessage]="emptyMessage"
      [selection]="selection"
      [rowLabel]="rowLabel"
      (pageChange)="changes.push($event)"
      (retry)="retries = retries + 1"
    >
      <ng-template appCell="status" let-row><app-status-chip [status]="row.status" /></ng-template>
    </app-data-table>
  `,
})
class Host {
  columns = columns;
  rows: Row[] | undefined = rows;
  total = 3;
  page = 1;
  limit = 20;
  fetching = false;
  error: string | undefined;
  emptyMessage = 'Nothing to show.';
  selection: SelectionModel<Row> | undefined;
  rowLabel = (row: Row) => row.name;
  changes: TablePageChange[] = [];
  retries = 0;
}

describe('DataTable', () => {
  const show = (props: Partial<Host> = {}) =>
    render(Host, { componentProperties: props, providers: provideTestApp() });

  it('is a table named by its caption, with a header per column', async () => {
    await show();

    const table = screen.getByRole('table', { name: 'Rooms' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent.trim())).toEqual(['Name', 'Code', 'Status', 'Actions']);
  });

  it('keeps the header of a control column for screen readers only', async () => {
    await show();

    expect(screen.getByText('Actions')).toHaveClass('visually-hidden');
  });

  it('lets the keyboard scroll a table wider than its container', async () => {
    await show();

    const region = screen.getByRole('region', { name: 'Rooms' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });

  it('draws a row per record with text, links and custom cells', async () => {
    await show();

    const body = screen.getAllByRole('row').slice(1);
    expect(body).toHaveLength(3);
    expect(within(body[1]).getByRole('link', { name: 'Birch' })).toHaveAttribute(
      'href',
      '/rooms/b',
    );
    expect(within(body[1]).getByRole('cell', { name: 'B' })).toBeInTheDocument();
    expect(within(body[0]).getByText('Active')).toBeInTheDocument();
    expect(within(body[1]).getByText('Inactive')).toBeInTheDocument();
  });

  it('leaves the text of a row plain when its link has no target', async () => {
    await show();

    const cedar = screen.getAllByRole('row')[3];
    expect(within(cedar).getByRole('cell', { name: 'Cedar' })).toBeInTheDocument();
    expect(within(cedar).queryByRole('link')).not.toBeInTheDocument();
  });

  describe('loading', () => {
    it('says it is loading until the first rows arrive', async () => {
      await show({ rows: undefined, total: 0, fetching: true });

      expect(screen.getByText('Loading Rooms…')).toHaveAttribute('role', 'status');
      // One announcement, not two: the status row speaks, the bar is for refreshes only.
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('keeps the rows on screen while the next page loads', async () => {
      await show({ fetching: true });

      expect(screen.getByRole('link', { name: 'Atlas' })).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Loading Rooms' })).toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Rooms' })).toHaveAttribute('aria-busy', 'true');
    });

    it('shows no progress bar when nothing is loading', async () => {
      await show();

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('failure', () => {
    it('shows why the load failed and offers a retry', async () => {
      const { fixture } = await show({ rows: undefined, total: 0, error: 'The server is down.' });

      expect(screen.getByRole('alert')).toHaveTextContent('The server is down.');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(fixture.componentInstance.retries).toBe(1);
    });

    it('keeps showing the rows when a later load fails', async () => {
      await show({ error: 'The server is down.' });

      expect(screen.getByRole('link', { name: 'Atlas' })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('empty page', () => {
    it('says there is nothing to show by default', async () => {
      await show({ rows: [], total: 0 });

      expect(screen.getByText('Nothing to show.')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says what the page asks it to say', async () => {
      await show({ rows: [], total: 0, emptyMessage: 'No bookings yet.' });

      expect(screen.getByText('No bookings yet.')).toBeInTheDocument();
    });

    it('has no paginator when there is nothing to page', async () => {
      await show({ rows: [], total: 0 });

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
    });
  });

  describe('paging', () => {
    it('shows where the page is among the results', async () => {
      await show({ total: 95, page: 2, limit: 20 });

      expect(screen.getByText('21 – 40 of 95')).toBeInTheDocument();
    });

    it('reports the next page, 1-based, with the page size', async () => {
      const { fixture } = await show({ total: 95, page: 2, limit: 20 });

      await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
      await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
      await userEvent.click(screen.getByRole('button', { name: 'Last page' }));
      await userEvent.click(screen.getByRole('button', { name: 'First page' }));

      expect(fixture.componentInstance.changes).toEqual([
        { page: 3, limit: 20 },
        { page: 2, limit: 20 },
        { page: 5, limit: 20 },
        { page: 1, limit: 20 },
      ]);
    });

    it('reports a new page size', async () => {
      const { fixture } = await show({ total: 95, page: 1, limit: 20 });

      await userEvent.click(screen.getByRole('combobox', { name: 'Items per page:' }));
      await userEvent.click(await screen.findByRole('option', { name: '50' }));

      expect(fixture.componentInstance.changes).toEqual([{ page: 1, limit: 50 }]);
    });

    it('names the paginator after the table', async () => {
      await show({ total: 95 });

      expect(screen.getByRole('group', { name: 'Rooms pages' })).toBeInTheDocument();
    });
  });

  describe('selection', () => {
    const select = () => new SelectionModel<Row>(true, [], true, (a, b) => a.id === b.id);

    it('has no checkboxes unless the page passes a selection', async () => {
      await show();

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('selects a row from its checkbox, named after the row', async () => {
      const selection = select();
      await show({ selection });

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Birch' }));

      expect(selection.selected.map((r) => r.id)).toEqual(['b']);
      expect(screen.getByRole('checkbox', { name: 'Select Birch' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select Atlas' })).not.toBeChecked();
    });

    it('selects and clears the whole page from the header', async () => {
      const selection = select();
      await show({ selection });
      const all = screen.getByRole('checkbox', { name: 'Select all rows on this page' });

      await userEvent.click(all);
      expect(selection.selected).toHaveLength(3);
      expect(all).toBeChecked();

      await userEvent.click(all);
      expect(selection.isEmpty()).toBe(true);
      expect(all).not.toBeChecked();
    });

    it('shows a partial selection as indeterminate', async () => {
      const selection = select();
      await show({ selection });

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Cedar' }));

      const all = screen.getByRole('checkbox', { name: 'Select all rows on this page' });
      expect(all).toBePartiallyChecked();

      await userEvent.click(all);
      expect(selection.selected).toHaveLength(3);
    });

    it('follows the page when it clears the selection', async () => {
      const selection = select();
      const { fixture } = await show({ selection });
      await userEvent.click(screen.getByRole('checkbox', { name: 'Select Atlas' }));

      selection.clear();
      await fixture.whenStable();

      expect(screen.getByRole('checkbox', { name: 'Select Atlas' })).not.toBeChecked();
    });

    it('counts rows as selected by id, so a refetched row stays selected', async () => {
      const selection = select();
      selection.select({ id: 'a', name: 'Atlas (old copy)', status: 'active' });
      await show({ selection });

      expect(screen.getByRole('checkbox', { name: 'Select Atlas' })).toBeChecked();
    });

    it('cannot select the whole page when it is empty', async () => {
      await show({ selection: select(), rows: [], total: 0 });

      expect(screen.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeDisabled();
    });

    it('names a row by its id unless told otherwise', async () => {
      await render(DataTable<Row>, {
        inputs: { caption: 'Rooms', columns, rows, selection: select() },
        providers: provideTestApp(),
      });

      expect(screen.getByRole('checkbox', { name: 'Select a' })).toBeInTheDocument();
    });
  });
});
