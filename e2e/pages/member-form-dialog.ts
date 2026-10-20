import type { Locator, Page } from '@playwright/test';
import { chooseOption } from './controls';
import { FormDialog } from './form-dialog';

export interface MemberFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  /** `Day pass`, `Flex`, `Dedicated` or `Team`. */
  plan?: string;
  /** `Active`, `Suspended` or `Cancelled`. */
  status?: string;
}

/** The dialog that adds a member (`New member`) or edits one (`Edit <name>`). */
export class MemberFormDialog extends FormDialog {
  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly phone: Locator;
  readonly company: Locator;

  constructor(page: Page, title: string | RegExp) {
    super(page, title);
    this.firstName = this.textbox('First name');
    this.lastName = this.textbox('Last name');
    this.email = this.textbox('Email');
    this.phone = this.textbox('Phone');
    this.company = this.textbox('Company');
  }

  protected get initialFocus(): Locator {
    return this.firstName;
  }

  async fill(fields: MemberFields): Promise<void> {
    if (fields.firstName !== undefined) await this.firstName.fill(fields.firstName);
    if (fields.lastName !== undefined) await this.lastName.fill(fields.lastName);
    if (fields.email !== undefined) await this.email.fill(fields.email);
    if (fields.phone !== undefined) await this.phone.fill(fields.phone);
    if (fields.company !== undefined) await this.company.fill(fields.company);
    if (fields.plan) await chooseOption(this.combobox('Plan'), fields.plan);
    if (fields.status) await chooseOption(this.combobox('Status'), fields.status);
  }
}
