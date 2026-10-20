import { expect, type Locator, type Page } from '@playwright/test';
import { DataTable } from './data-table';
import { ListToolbar } from './list-toolbar';
import { RoomFormDialog } from './room-form-dialog';

/** `/rooms`. */
export class RoomsPage {
  readonly heading: Locator;
  readonly newRoom: Locator;
  readonly toolbar: ListToolbar;
  readonly table: DataTable;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Rooms', level: 1 });
    this.newRoom = page.getByRole('button', { name: 'New room' });
    this.toolbar = new ListToolbar(page, 'Filter rooms');
    this.table = new DataTable(page, 'Rooms');
  }

  async goto(query = ''): Promise<void> {
    await this.page.goto(`/rooms${query}`);
    await expect(this.heading).toBeVisible();
  }

  async openNewRoomForm(): Promise<RoomFormDialog> {
    await this.newRoom.click();
    const dialog = new RoomFormDialog(this.page, 'New room');
    await dialog.expectOpen();
    return dialog;
  }
}
