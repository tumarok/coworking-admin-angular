import type { Locator, Page } from '@playwright/test';
import { chooseOption } from './controls';

/** The search and filters above a list, and the chips of the filters the address names. */
export class ListToolbar {
  readonly toolbar: Locator;
  readonly search: Locator;
  readonly clearFilters: Locator;
  /** The removable chips of the records the list is narrowed to. */
  readonly chips: Locator;

  constructor(page: Page, label: string) {
    this.toolbar = page.getByRole('search', { name: label });
    this.search = this.toolbar.getByRole('searchbox');
    this.clearFilters = page.getByRole('button', { name: 'Clear filters' });
    this.chips = page.getByRole('list', { name: 'Filtering by' }).getByRole('listitem');
  }

  filter(name: string): Locator {
    return this.toolbar.getByRole('combobox', { name, exact: true });
  }

  async choose(filter: string, option: string): Promise<void> {
    await chooseOption(this.filter(filter), option);
  }

  chip(text: string | RegExp): Locator {
    return this.chips.filter({ hasText: text });
  }

  async removeChip(text: string | RegExp): Promise<void> {
    await this.chip(text)
      .getByRole('button', { name: /^Remove / })
      .click();
  }
}
