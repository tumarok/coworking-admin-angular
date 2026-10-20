import { expect, type Locator, type Page } from '@playwright/test';
import { DataTable } from './data-table';
import { ListToolbar } from './list-toolbar';
import { MemberFormDialog } from './member-form-dialog';

/** `/members`. */
export class MembersPage {
  readonly heading: Locator;
  readonly newMember: Locator;
  readonly toolbar: ListToolbar;
  readonly table: DataTable;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Members', level: 1 });
    this.newMember = page.getByRole('button', { name: 'New member' });
    this.toolbar = new ListToolbar(page, 'Filter members');
    this.table = new DataTable(page, 'Members');
  }

  async goto(): Promise<void> {
    await this.page.goto('/members');
    await expect(this.heading).toBeVisible();
  }

  async openNewMemberForm(): Promise<MemberFormDialog> {
    await this.newMember.click();
    const dialog = new MemberFormDialog(this.page, 'New member');
    await dialog.expectOpen();
    return dialog;
  }
}
