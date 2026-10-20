import type { Locator, Page } from '@playwright/test';
import { chooseOption } from './controls';
import { FormDialog } from './form-dialog';

export interface LocationFields {
  name?: string;
  city?: string;
  address?: string;
  /** An IANA name, `Europe/Berlin`. */
  timezone?: string;
  /** `Active` or `Inactive`. */
  status?: string;
  /** `HH:mm`. */
  opensAt?: string;
  closesAt?: string;
}

/** The dialog that creates a location (`New location`) or edits one (`Edit <name>`). */
export class LocationFormDialog extends FormDialog {
  readonly name: Locator;
  readonly city: Locator;
  readonly address: Locator;
  readonly opensAt: Locator;
  readonly closesAt: Locator;

  constructor(page: Page, title: string | RegExp) {
    super(page, title);
    this.name = this.textbox('Name');
    this.city = this.textbox('City');
    this.address = this.textbox('Address');
    this.opensAt = this.combobox('Opens at');
    this.closesAt = this.combobox('Closes at');
  }

  protected get initialFocus(): Locator {
    return this.name;
  }

  async fill(fields: LocationFields): Promise<void> {
    if (fields.name !== undefined) await this.name.fill(fields.name);
    if (fields.city !== undefined) await this.city.fill(fields.city);
    if (fields.address !== undefined) await this.address.fill(fields.address);
    if (fields.timezone) await chooseOption(this.combobox('Time zone'), fields.timezone);
    if (fields.status) await chooseOption(this.combobox('Status'), fields.status);
    if (fields.opensAt) await this.opensAt.fill(fields.opensAt);
    if (fields.closesAt) await this.closesAt.fill(fields.closesAt);
  }
}
