import { expect, type Locator } from '@playwright/test';

/**
 * Chooses an option of a dropdown: a Material select (a form field or a list filter), whose
 * options open in an overlay outside the field.
 */
export async function chooseOption(select: Locator, option: string): Promise<void> {
  await select.click();
  const choice = select.page().getByRole('option', { name: option, exact: true });
  await choice.click();
  await expect(choice).toBeHidden();
}

/**
 * Chooses a record in an `app-autocomplete-field`: types the search, waits for the server's answer
 * to list the record (the field searches a moment after typing stops), and picks it. The chosen
 * record's text is then in the box.
 */
export async function chooseFromSearch(
  input: Locator,
  search: string,
  option: string | RegExp,
): Promise<void> {
  await input.fill(search);
  const choice = input.page().getByRole('option', { name: option });
  await choice.click();
  await expect(choice).toBeHidden();
  await expect(input).not.toHaveValue(search);
}
