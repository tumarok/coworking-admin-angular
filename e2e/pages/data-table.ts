import { expect, type Locator, type Page } from '@playwright/test';

/** `app-data-table`: the table of a list page and its pager. */
export class DataTable {
  readonly table: Locator;
  /** The rows of the body (the header row has no cells). */
  readonly rows: Locator;
  /** "1 – 20 of 57". */
  readonly range: Locator;
  readonly selectAll: Locator;

  constructor(
    private readonly page: Page,
    caption: string,
  ) {
    this.table = page.getByRole('table', { name: caption });
    this.rows = this.table.getByRole('row').filter({ has: page.getByRole('cell') });
    this.range = page.getByRole('group', { name: `${caption} pages` }).getByRole('status');
    this.selectAll = this.table.getByRole('checkbox', { name: 'Select all rows on this page' });
  }

  /** The row that holds this text. */
  row(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text });
  }

  link(name: string | RegExp): Locator {
    return this.table.getByRole('link', { name });
  }

  /** The tick box of the row that holds this text. */
  checkbox(rowText: string | RegExp): Locator {
    return this.row(rowText).getByRole('checkbox');
  }

  /**
   * Says there is nothing to list: the only row is the page's own words for it ("No rooms match…").
   * It waits for those words first: a table that is still loading, or still shows the rows of the
   * search before, has one row or many, and either is only a step on the way.
   */
  async expectEmpty(): Promise<void> {
    await expect(this.rows.filter({ hasText: /^\s*(No |Nothing )/ })).toHaveCount(1);
    await expect(this.rows).toHaveCount(1);
  }

  async expectRows(count: number): Promise<void> {
    await expect(this.rows).toHaveCount(count);
  }

  /** The list has been drawn: rows (or the empty message) are in place of "Loading". */
  async expectLoaded(): Promise<void> {
    await expect(this.table).toBeVisible();
    await expect(this.page.getByRole('status').filter({ hasText: /^Loading / })).toHaveCount(0);
    await expect(this.rows.first()).toBeVisible();
  }
}
