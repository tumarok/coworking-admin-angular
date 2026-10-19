import { Component, signal } from '@angular/core';
import { form, FormField, submit } from '@angular/forms/signals';
import { render, screen } from '@testing-library/angular';
import { focusFirstInvalid } from './focus-first-invalid';
import { serverErrors } from './server-errors';

@Component({
  imports: [FormField],
  template: `
    <input aria-label="Name" [formField]="f.name" />
    <input aria-label="City" [formField]="f.city" />
    <input aria-label="Address" [formField]="f.address" />
  `,
})
class Host {
  readonly f = form(signal({ name: 'a', city: 'b', address: 'c' }));
}

describe('focusFirstInvalid', () => {
  async function open() {
    const view = await render(Host);
    return view.fixture.componentInstance.f;
  }

  it('focuses the first control whose field has an error', async () => {
    const f = await open();
    await submit(f, {
      action: () =>
        Promise.resolve(
          serverErrors(f, {
            status: 422,
            message: 'Validation failed',
            fieldErrors: { address: 'Unknown', city: 'Wrong' },
            conflicts: [],
          }),
        ),
    });

    focusFirstInvalid(f);

    expect(screen.getByRole('textbox', { name: 'City' })).toHaveFocus();
  });

  it('falls back to the first control when only the form as a whole has an error', async () => {
    const f = await open();
    screen.getByRole('textbox', { name: 'Address' }).focus();
    await submit(f, {
      action: () =>
        Promise.resolve(
          serverErrors(f, { status: 409, message: 'Conflict', fieldErrors: {}, conflicts: [] }),
        ),
    });

    focusFirstInvalid(f);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('keeps focus where it is for a form without errors', async () => {
    const f = await open();
    screen.getByRole('textbox', { name: 'Address' }).focus();

    focusFirstInvalid(f);

    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveFocus();
  });
});
