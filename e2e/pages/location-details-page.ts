import { expect, type Locator, type Page } from '@playwright/test';
import { ConfirmDialog } from './confirm-dialog';
import { DetailsList } from './details-list';
import { LocationFormDialog } from './location-form-dialog';

/** `/locations/:id`. */
export class LocationDetailsPage {
  readonly heading: Locator;
  readonly edit: Locator;
  readonly delete: Locator;
  readonly viewRooms: Locator;
  readonly facts: DetailsList;

  constructor(
    private readonly page: Page,
    /** The location's name, which is the heading. */
    private readonly name: string,
  ) {
    this.heading = page.getByRole('heading', { name, level: 1 });
    this.edit = page.getByRole('button', { name: 'Edit', exact: true });
    this.delete = page.getByRole('button', { name: 'Delete', exact: true });
    this.viewRooms = page.getByRole('link', { name: 'View rooms' });
    this.facts = new DetailsList(page);
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/locations/${id}`);
    await expect(this.heading).toBeVisible();
  }

  async openEditForm(): Promise<LocationFormDialog> {
    await this.edit.click();
    const dialog = new LocationFormDialog(this.page, `Edit ${this.name}`);
    await dialog.expectOpen();
    return dialog;
  }

  async askToDelete(): Promise<ConfirmDialog> {
    await this.delete.click();
    const dialog = new ConfirmDialog(this.page, `Delete ${this.name}?`);
    await dialog.expectOpen();
    return dialog;
  }
}
