import { expect, type Locator, type Page } from '@playwright/test';
import { ConfirmDialog } from './confirm-dialog';
import { DetailsList } from './details-list';
import { MemberFormDialog } from './member-form-dialog';

/** `/members/:id`. */
export class MemberDetailsPage {
  readonly heading: Locator;
  readonly edit: Locator;
  readonly delete: Locator;
  readonly viewBookings: Locator;
  readonly facts: DetailsList;

  constructor(
    private readonly page: Page,
    /** The member's full name, which is the heading. */
    private readonly name: string,
  ) {
    this.heading = page.getByRole('heading', { name, level: 1 });
    this.edit = page.getByRole('button', { name: 'Edit', exact: true });
    this.delete = page.getByRole('button', { name: 'Delete', exact: true });
    this.viewBookings = page.getByRole('link', { name: 'View bookings' });
    this.facts = new DetailsList(page);
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/members/${id}`);
    await expect(this.heading).toBeVisible();
  }

  async openEditForm(): Promise<MemberFormDialog> {
    await this.edit.click();
    const dialog = new MemberFormDialog(this.page, `Edit ${this.name}`);
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
