import { expect, type Locator, type Page } from '@playwright/test';
import { DataTable } from './data-table';
import { ListToolbar } from './list-toolbar';
import { LocationFormDialog } from './location-form-dialog';

/** `/locations`. */
export class LocationsPage {
  readonly heading: Locator;
  readonly newLocation: Locator;
  readonly toolbar: ListToolbar;
  readonly table: DataTable;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Locations', level: 1 });
    this.newLocation = page.getByRole('button', { name: 'New location' });
    this.toolbar = new ListToolbar(page, 'Filter locations');
    this.table = new DataTable(page, 'Locations');
  }

  async goto(): Promise<void> {
    await this.page.goto('/locations');
    await expect(this.heading).toBeVisible();
  }

  async openNewLocationForm(): Promise<LocationFormDialog> {
    await this.newLocation.click();
    const dialog = new LocationFormDialog(this.page, 'New location');
    await dialog.expectOpen();
    return dialog;
  }
}
