import { SelectionModel } from '@angular/cdk/collections';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatPaginator, type PageEvent } from '@angular/material/paginator';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AppIcon } from './app-icon';
import { DataTableCell } from './data-table-cell';

export interface DataTableColumn<T> {
  /** Unique within the table; also the key of a custom cell (`appCell`). */
  key: string;
  header: string;
  /** The text of a cell. Not needed when the column has a custom cell. */
  value?: (row: T) => string;
  /** Turns the text into a link to this route. */
  link?: (row: T) => string | readonly string[];
  /** Keeps the header for screen readers only, for columns of controls. */
  hideHeader?: boolean;
  /** Keeps a cell on one line. */
  nowrap?: boolean;
}

/** The page and page size the paginator asks for; the page is 1-based. */
export interface TablePageChange {
  page: number;
  limit: number;
}

const SELECT_COLUMN = 'select';

/**
 * A server-paged table: the page decides what to show and what a change of page does, the table
 * draws it. It has no sorting, as the API has none.
 *
 * - **Rows.** `rows` is `undefined` until the first answer, then the current page. `fetching` marks
 *   a request in flight; the rows stay on screen under a progress bar, so paging does not flash.
 * - **States.** First load, an error with nothing to show, and an empty page each get a row of
 *   their own in the table body. The page words the empty one (`emptyMessage`): only it knows
 *   whether filters, a page past the end or an empty collection is the reason.
 * - **Paging.** `page` is 1-based; `(pageChange)` carries the next page and the page size, and the
 *   page puts them in the URL (see `withListParams`).
 * - **Selection.** Pass a `SelectionModel` to add checkboxes; it belongs to the page, which can
 *   clear it and reads it for bulk actions. Rows count as the same when their `id` is.
 */
@Component({
  selector: 'app-data-table',
  imports: [
    AppIcon,
    MatButton,
    MatCheckbox,
    MatPaginator,
    MatProgressBar,
    MatTableModule,
    NgTemplateOutlet,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
})
export class DataTable<T extends { id: string }> {
  /** Names the table for assistive technology: "Bookings". */
  readonly caption = input.required<string>();
  readonly columns = input.required<readonly DataTableColumn<T>[]>();
  readonly rows = input<readonly T[]>();
  readonly total = input(0);
  readonly page = input(1);
  readonly limit = input(20);
  readonly pageSizeOptions = input<readonly number[]>([10, 20, 50]);
  readonly fetching = input(false);
  /** Why the load failed; shown, with a retry, only while there is nothing else to show. */
  readonly error = input<string>();
  readonly emptyMessage = input('Nothing to show.');
  readonly selection = input<SelectionModel<T>>();
  /** Names a row for its checkbox: "Select <label>". */
  readonly rowLabel = input<(row: T) => string>((row) => row.id);

  readonly pageChange = output<TablePageChange>();
  readonly retry = output();

  private readonly customCells = contentChildren(DataTableCell);

  /** Bumped on every selection change, which is not a signal itself. */
  private readonly selectionRevision = signal(0);

  protected readonly cellTemplates = computed(
    () => new Map(this.customCells().map((cell) => [cell.key(), cell.template])),
  );
  protected readonly columnIds = computed(() => [
    ...(this.selection() ? [SELECT_COLUMN] : []),
    ...this.columns().map((column) => column.key),
  ]);
  protected readonly dataSource = computed(() => this.rows() ?? []);
  protected readonly loading = computed(() => this.rows() === undefined && !this.error());
  protected readonly selectedIds = computed(() => {
    this.selectionRevision();
    return new Set(this.selection()?.selected.map((row) => row.id));
  });
  protected readonly allSelected = computed(
    () =>
      this.dataSource().length > 0 && this.dataSource().every((r) => this.selectedIds().has(r.id)),
  );
  protected readonly someSelected = computed(
    () => !this.allSelected() && this.dataSource().some((r) => this.selectedIds().has(r.id)),
  );

  protected readonly selectColumn = SELECT_COLUMN;
  protected readonly trackById = (_index: number, row: T) => row.id;

  constructor() {
    effect((onCleanup) => {
      const model = this.selection();
      this.selectionRevision.update((n) => n + 1);
      if (!model) return;
      const subscription = model.changed.subscribe(() => {
        this.selectionRevision.update((n) => n + 1);
      });
      onCleanup(() => {
        subscription.unsubscribe();
      });
    });
  }

  protected onPage(event: PageEvent): void {
    this.pageChange.emit({ page: event.pageIndex + 1, limit: event.pageSize });
  }

  protected toggleRow(row: T): void {
    this.selection()?.toggle(row);
  }

  protected toggleAll(): void {
    const model = this.selection();
    if (!model) return;
    if (this.allSelected()) model.deselect(...this.dataSource());
    else model.select(...this.dataSource());
  }

  protected textOf(column: DataTableColumn<T>, row: T): string {
    return column.value?.(row) ?? '';
  }
}
