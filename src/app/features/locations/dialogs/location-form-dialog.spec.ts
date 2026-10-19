import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { Location } from '@shared/api/contract';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { injectLocationFormDialog } from './open-location-form';

@Component({
  template: `
    <button type="button" (click)="open()">Open form</button>
    <button type="button" (click)="open(location)">Open edit form</button>
  `,
})
class Opener {
  private readonly openForm = injectLocationFormDialog();
  location: Location | undefined;
  results: (Location | undefined)[] = [];
  async open(location?: Location) {
    this.results.push(await this.openForm(location));
  }
}

describe('LocationFormDialog', () => {
  // The first open fetches the form's chunk (Material select, time picker, Zod). Doing it here
  // keeps that one-off cost out of the first test, which would otherwise race the 5 s wait.
  beforeAll(async () => {
    await import('./location-form-dialog');
  });

  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    requests = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'GET')
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
    });
  });

  afterEach(() => {
    server.events.removeAllListeners();
  });

  async function open({ editing = false } = {}) {
    const view = await render(Opener, { providers: provideTestSession() });
    const opener = view.fixture.componentInstance;
    if (editing) opener.location = savedLocation();
    await userEvent.click(
      screen.getByRole('button', { name: editing ? 'Open edit form' : 'Open form' }),
    );
    const dialog = await screen.findByRole('dialog', { name: editing ? /^Edit / : 'New location' });
    return { ...view, opener, dialog };
  }

  const savedLocation = (): Location => {
    const record = api.db.locations[0];
    return { ...record, roomCount: api.db.rooms.filter((r) => r.locationId === record.id).length };
  };

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  /** The controls of the open dialog, by their labels. */
  const field = {
    name: () => screen.getByRole('textbox', { name: /^Name/ }),
    city: () => screen.getByRole('textbox', { name: /^City/ }),
    address: () => screen.getByRole('textbox', { name: /^Address/ }),
    timezone: () => screen.getByRole('combobox', { name: /^Time zone/ }),
    status: () => screen.getByRole('combobox', { name: /^Status/ }),
    opensAt: () => screen.getByRole('combobox', { name: /^Opens at/ }),
    closesAt: () => screen.getByRole('combobox', { name: /^Closes at/ }),
  };
  const save = () => screen.getByRole('button', { name: /^Save|Saving/ });

  async function replace(control: HTMLElement, text: string) {
    await userEvent.clear(control);
    await userEvent.type(control, text);
  }

  async function fillNew() {
    await userEvent.type(field.name(), 'Harbour Hub');
    await userEvent.type(field.city(), 'Lisbon');
    await userEvent.type(field.address(), '12 Dock Street');
  }

  const refuse = (status: number, body: object, method: 'post' | 'patch' = 'post') => {
    server.use(
      http[method](apiUrl('/locations/:id?'), () => HttpResponse.json(body, { status }), {
        once: true,
      }),
    );
  };

  describe('a new location', () => {
    it('is a dialog titled "New location" with the form for the details', async () => {
      const { dialog } = await open();

      expect(dialog).toHaveAccessibleName('New location');
      expect(field.name()).toHaveValue('');
      expect(field.city()).toHaveValue('');
      expect(field.address()).toHaveValue('');
      expect(field.timezone()).toHaveTextContent('Europe/Kyiv');
      expect(field.status()).toHaveTextContent('Active');
      expect(field.opensAt()).toHaveValue('08:00');
      expect(field.closesAt()).toHaveValue('20:00');
    });

    it('marks the text and time fields as required', async () => {
      await open();

      for (const control of [
        field.name,
        field.city,
        field.address,
        field.opensAt,
        field.closesAt,
      ]) {
        expect(control()).toBeRequired();
      }
    });

    it('opens with the cursor in the first field', async () => {
      await open();

      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });
    });

    it('cannot be saved until it is valid', async () => {
      await open();
      expect(save()).toBeDisabled();

      await userEvent.type(field.name(), 'Harbour Hub');
      await userEvent.type(field.city(), 'Lisbon');
      expect(save()).toBeDisabled();

      await userEvent.type(field.address(), '12 Dock Street');
      expect(save()).toBeEnabled();
    });

    it('creates the location, says so, closes and hands the new location on', async () => {
      const { opener } = await open();
      await fillNew();
      await userEvent.click(field.timezone());
      await userEvent.click(screen.getByRole('option', { name: 'Europe/Lisbon' }));
      await userEvent.click(field.status());
      await userEvent.click(screen.getByRole('option', { name: 'Inactive' }));

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const created = api.db.locations.find((l) => l.name === 'Harbour Hub');
      expect(created).toMatchObject({
        city: 'Lisbon',
        address: '12 Dock Street',
        timezone: 'Europe/Lisbon',
        status: 'inactive',
        opensAt: '08:00',
        closesAt: '20:00',
      });
      expect(opener.results).toEqual([
        expect.objectContaining({ id: created?.id, name: 'Harbour Hub' }),
      ]);
      expect(requests).toEqual(['POST /api/v1/locations']);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Location created: Harbour Hub');
    });

    it('sends trimmed text', async () => {
      await open();
      await userEvent.type(field.name(), '  Harbour Hub  ');
      await userEvent.type(field.city(), ' Lisbon ');
      await userEvent.type(field.address(), '  12 Dock Street ');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.locations.at(-1)?.name).toBe('Harbour Hub');
      });
      expect(api.db.locations.at(-1)).toMatchObject({ city: 'Lisbon', address: '12 Dock Street' });
    });

    it('closes without a result, and sends nothing, on Cancel', async () => {
      const { opener, dialog } = await open();
      await fillNew();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(requests).toEqual([]);
    });
  });

  describe('an existing location', () => {
    it('is titled with the name and starts from the saved values', async () => {
      const location = (await open({ editing: true })).dialog;
      const saved = savedLocation();

      expect(location).toHaveAccessibleName(`Edit ${saved.name}`);
      expect(field.name()).toHaveValue(saved.name);
      expect(field.city()).toHaveValue(saved.city);
      expect(field.address()).toHaveValue(saved.address);
      expect(field.timezone()).toHaveTextContent(saved.timezone);
      expect(field.opensAt()).toHaveValue(saved.opensAt);
      expect(field.closesAt()).toHaveValue(saved.closesAt);
    });

    it('cannot be saved while nothing is changed, and can once something is', async () => {
      await open({ editing: true });
      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });
      expect(save()).toBeDisabled();

      await userEvent.type(field.name(), 'x');
      expect(save()).toBeEnabled();
    });

    it('cannot be saved again once a change is taken back', async () => {
      await open({ editing: true });

      await userEvent.type(field.name(), 'x');
      expect(save()).toBeEnabled();
      await userEvent.type(field.name(), '{Backspace}');

      expect(save()).toBeDisabled();
    });

    it('saves the whole location, says so, closes and hands the saved location on', async () => {
      const { opener } = await open({ editing: true });
      const saved = savedLocation();

      await replace(field.name(), 'Riverside North');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(opener.results[0]).toMatchObject({ id: saved.id, name: 'Riverside North' });
      expect(api.db.locations[0]).toMatchObject({
        name: 'Riverside North',
        city: saved.city,
        address: saved.address,
        timezone: saved.timezone,
        opensAt: saved.opensAt,
        closesAt: saved.closesAt,
        status: saved.status,
      });
      expect(requests).toEqual([`PATCH /api/v1/locations/${saved.id}`]);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Location updated: Riverside North');
    });

    it('takes a time picked from the list', async () => {
      const { opener } = await open({ editing: true });

      await userEvent.click(screen.getByRole('button', { name: 'Choose the closing time' }));
      await userEvent.click(await screen.findByRole('option', { name: '22:30' }));
      expect(field.closesAt()).toHaveValue('22:30');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.locations[0].closesAt).toBe('22:30');
    });
  });

  describe('validation', () => {
    it('shows no error before a field is touched, and words it once the field is left', async () => {
      await open();

      await userEvent.type(field.name(), 'a');
      expect(screen.queryByText('At least 2 characters')).not.toBeInTheDocument();
      await userEvent.tab();

      expect(screen.getByText('At least 2 characters')).toBeInTheDocument();
      expect(field.name()).toHaveAccessibleDescription('At least 2 characters');
      expect(field.name()).toBeInvalid();
    });

    it('asks for an address of at least 5 characters', async () => {
      await open();

      await userEvent.type(field.address(), 'abcd');
      await userEvent.tab();

      expect(screen.getByText('At least 5 characters')).toBeInTheDocument();
    });

    it('takes the error away when the value is fixed', async () => {
      await open();
      await userEvent.type(field.name(), 'a');
      await userEvent.tab();

      await userEvent.type(field.name(), 'b');

      expect(field.name()).toBeValid();
      expect(field.name()).not.toHaveAccessibleDescription('At least 2 characters');
    });

    it('rejects a closing time that is not after the opening time, under the closing field', async () => {
      await open();
      await fillNew();

      await replace(field.closesAt(), '07:00');
      await userEvent.tab();

      expect(
        await screen.findByText('Closing time must be after opening time'),
      ).toBeInTheDocument();
      expect(field.closesAt()).toHaveAccessibleDescription(
        'Closing time must be after opening time',
      );
      expect(field.closesAt()).toBeInvalid();
      expect(field.opensAt()).not.toHaveAttribute('aria-invalid', 'true');
      expect(save()).toBeDisabled();

      await replace(field.closesAt(), '09:30');
      expect(save()).toBeEnabled();
    });

    it('shows the closing error when only the opening time was changed', async () => {
      await open();
      await fillNew();

      await replace(field.opensAt(), '21:00');
      await userEvent.tab();

      expect(
        await screen.findByText('Closing time must be after opening time'),
      ).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('rejects the same time for opening and closing', async () => {
      await open();
      await fillNew();

      await replace(field.closesAt(), '08:00');
      await userEvent.tab();

      expect(
        await screen.findByText('Closing time must be after opening time'),
      ).toBeInTheDocument();
    });

    it('words an unreadable time as the format the API wants', async () => {
      await open();
      await fillNew();

      await replace(field.opensAt(), 'early');
      await userEvent.tab();

      expect(await screen.findByText('Use the HH:mm format')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('shows what is wrong, focuses the first problem and sends nothing when Enter is pressed in an invalid form', async () => {
      await open();
      await userEvent.type(field.city(), 'L');

      await userEvent.keyboard('{Enter}');

      expect(screen.getAllByText('At least 2 characters')).toHaveLength(2);
      expect(screen.getByText('At least 5 characters')).toBeInTheDocument();
      expect(field.name()).toHaveFocus();
      expect(requests).toEqual([]);
    });

    it('shows what is wrong, and focuses the first problem, when the form itself is submitted while invalid', async () => {
      const { dialog } = await open();
      await userEvent.type(field.name(), 'Harbour Hub');
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);

      expect(await screen.findByText('At least 2 characters')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.city()).toHaveFocus();
      });
      expect(requests).toEqual([]);
    });
  });

  describe('when the server refuses with field errors (422)', () => {
    const FIELD_ERRORS = {
      message: 'Validation failed',
      fieldErrors: { name: 'This name is already used', address: 'Unknown street' },
    };

    it('shows each message under its field, keeps the dialog open and says nothing else', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);

      await userEvent.click(save());

      expect(await screen.findByText('This name is already used')).toBeInTheDocument();
      expect(screen.getByText('Unknown street')).toBeInTheDocument();
      expect(field.name()).toHaveAccessibleDescription('This name is already used');
      expect(field.address()).toHaveAccessibleDescription('Unknown street');
      expect(field.name()).toBeInvalid();
      expect(field.city()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
      expect(
        screen
          .getAllByRole('alert')
          .map((a) => a.textContent.trim())
          .sort(),
      ).toEqual(['This name is already used', 'Unknown street']);
    });

    it('moves focus to the first field with an error', async () => {
      await open();
      await fillNew();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { address: 'Unknown street', city: 'No such city' },
      });

      await userEvent.click(save());

      await screen.findByText('Unknown street');
      await vi.waitFor(() => {
        expect(field.city()).toHaveFocus();
      });
    });

    it('takes a message away when its field is edited, and keeps the other', async () => {
      await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);
      await userEvent.click(save());
      await screen.findByText('This name is already used');

      await userEvent.type(field.name(), '2');

      expect(screen.queryByText('This name is already used')).not.toBeInTheDocument();
      expect(screen.getByText('Unknown street')).toBeInTheDocument();
    });

    it('cannot be saved again until the fields with a message are changed', async () => {
      await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);
      await userEvent.click(save());
      await screen.findByText('This name is already used');
      expect(save()).toBeDisabled();

      await userEvent.type(field.name(), '2');
      expect(save()).toBeDisabled();
      await userEvent.type(field.address(), '5');

      expect(save()).toBeEnabled();
    });

    it('saves after the person corrects the fields', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);
      await userEvent.click(save());
      await screen.findByText('This name is already used');

      await replace(field.name(), 'Harbour Hub Two');
      await replace(field.address(), '14 Dock Street');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.locations.at(-1)?.name).toBe('Harbour Hub Two');
    });

    it('puts a message for the form as a whole, or for a field the form lacks, in a banner', async () => {
      await open();
      await fillNew();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { _: 'The request is not acceptable', zip: 'Unknown zip code' },
      });

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('The request is not acceptable');
      expect(banner).toHaveTextContent('Unknown zip code');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(snackbars()).toHaveLength(0);
    });

    it('shows a 422 on an edit under the field too', async () => {
      await open({ editing: true });
      await replace(field.name(), 'Taken');
      refuse(
        422,
        { message: 'Validation failed', fieldErrors: { name: 'This name is already used' } },
        'patch',
      );

      await userEvent.click(save());

      expect(await screen.findByText('This name is already used')).toBeInTheDocument();
    });
  });

  describe('when the server refuses otherwise', () => {
    it('shows a conflict (409) in a banner, keeps the dialog open and the snackbar out of it', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this location' });

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Another admin changed this location',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
    });

    it('moves focus to the first field after a banner, which the disabled fields had lost', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this location' });

      await userEvent.click(save());

      await screen.findByRole('alert');
      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });
    });

    it('lets Save be used again as the form is, so a failure that may pass needs no edit', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(502, { message: 'Bad gateway' });
      await userEvent.click(save());
      await screen.findByRole('alert');
      expect(save()).toBeEnabled();

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.locations.at(-1)?.name).toBe('Harbour Hub');
    });

    it('drops an old banner when the retry is refused with field errors', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this location' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { name: 'This name is already used' },
      });
      await userEvent.click(save());

      await screen.findByText('This name is already used');
      expect(screen.queryByText('Another admin changed this location')).not.toBeInTheDocument();
    });

    it('takes the banner away with the first edit, and the form can be saved again', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this location' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      await userEvent.type(field.city(), '!');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(save()).toBeEnabled();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('says so when the location was deleted meanwhile (404)', async () => {
      await open({ editing: true });
      api.db.locations.shift();
      await replace(field.name(), 'Riverside North');

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Location not found');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says so when the server cannot be reached', async () => {
      await open();
      await fillNew();
      server.use(http.post(apiUrl('/locations'), () => HttpResponse.error(), { once: true }));

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });
      expect(save()).toBeEnabled();
    });

    it('says what failed when a server error carries no message of its own', async () => {
      await open();
      await fillNew();
      server.use(
        http.post(
          apiUrl('/locations'),
          () => new HttpResponse('<html>bad gateway</html>', { status: 502 }),
          {
            once: true,
          },
        ),
      );

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    });
  });

  describe('while saving', () => {
    beforeEach(() => {
      server.use(
        http.post(apiUrl('/locations'), async () => {
          await delay(150);
          return HttpResponse.json(
            { ...savedLocation(), id: 'loc_new', name: 'Harbour Hub' },
            { status: 201 },
          );
        }),
      );
    });

    it('shows that it is busy, and neither saves again nor lets the dialog be cancelled', async () => {
      const { dialog } = await open();
      await fillNew();

      await userEvent.click(save());

      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(dialog.querySelector('form')).toHaveAttribute('aria-busy', 'true');
      expect(field.name()).toBeDisabled();
      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).toEqual(['POST /api/v1/locations']);
    });

    it('does not close on Escape or a click outside until the answer is in', async () => {
      const { opener } = await open();
      await fillNew();
      await userEvent.click(save());
      await screen.findByRole('button', { name: 'Saving…' });

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });
  });

  describe('submitting', () => {
    it('saves on Enter in a field when the form is valid and changed', async () => {
      const { opener } = await open();
      await fillNew();

      await userEvent.type(field.city(), '{Enter}');

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(requests).toEqual(['POST /api/v1/locations']);
    });

    it('sends nothing when the form is submitted while nothing is changed', async () => {
      const { dialog } = await open({ editing: true });
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(requests).toEqual([]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('leaves Enter on a button to the button', async () => {
      const { dialog } = await open();
      within(dialog).getByRole('button', { name: 'Cancel' }).focus();

      await userEvent.keyboard('{Enter}');

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).toEqual([]);
    });
  });

  describe('closing', () => {
    it('closes on Escape without a result', async () => {
      const { opener } = await open();
      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });

      fireEvent.keyDown(field.name(), { key: 'Escape', keyCode: 27 });

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
    });
  });
});
