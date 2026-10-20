import type { Locator, Page } from '@playwright/test';

/** The facts of a record on a details page: a term and the value that follows it. */
export class DetailsList {
  constructor(private readonly page: Page) {}

  /** The value of the fact with this label. */
  value(label: string): Locator {
    // A term has no accessible name of its own, so it is found by its text.
    return this.page
      .getByRole('term')
      .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) })
      .locator('xpath=following-sibling::*[1]');
  }
}
