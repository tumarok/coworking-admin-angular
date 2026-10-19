import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Room } from '@shared/api/contract';
import { humanize } from '@shared/util/format';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { injectRoomFormDialog } from './open-room-form';

@Component({
  template: `
    <button type="button" (click)="open()">Open form</button>
    <button type="button" (click)="open(room)">Open edit form</button>
  `,
})
class Opener {
  private readonly openForm = injectRoomFormDialog();
  room: Room | undefined;
  results: (Room | undefined)[] = [];
  async open(room?: Room) {
    this.results.push(await this.openForm(room));
  }
}

describe('RoomFormDialog', () => {
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

  const locationName = (id: string) => api.db.locations.find((l) => l.id === id)?.name ?? '—';
  const savedRoom = (): Room => {
    const record = api.db.rooms[0];
    return { ...record, locationName: locationName(record.locationId) };
  };

  async function open({ editing = false, room = savedRoom() } = {}) {
    const view = await render(Opener, { providers: provideTestSession() });
    const opener = view.fixture.componentInstance;
    if (editing) opener.room = room;
    await userEvent.click(
      screen.getByRole('button', { name: editing ? 'Open edit form' : 'Open form' }),
    );
    const dialog = await screen.findByRole('dialog', { name: editing ? /^Edit / : 'New room' });
    return { ...view, opener, dialog };
  }

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  /** The controls of the open dialog, by their labels. */
  const field = {
    location: () => screen.getByRole('combobox', { name: /^Location/ }),
    name: () => screen.getByRole('textbox', { name: /^Name/ }),
    type: () => screen.getByRole('combobox', { name: /^Type/ }),
    capacity: () => screen.getByRole('spinbutton', { name: /^Capacity/ }),
    rate: () => screen.getByRole('spinbutton', { name: /^Hourly rate/ }),
    amenities: () => screen.getByRole('combobox', { name: /^Amenities/ }),
    status: () => screen.getByRole('combobox', { name: /^Status/ }),
  };
  const save = () => screen.getByRole('button', { name: /^Save|Saving/ });

  async function replace(control: HTMLElement, text: string) {
    await userEvent.clear(control);
    await userEvent.type(control, text);
  }

  async function choose(control: HTMLElement, option: string) {
    await userEvent.click(control);
    await userEvent.click(await screen.findByRole('option', { name: option }));
  }

  async function fillNew() {
    await choose(field.location(), 'Canal Yard');
    await userEvent.type(field.name(), 'Harbour Room');
  }

  const refuse = (status: number, body: object, method: 'post' | 'patch' = 'post') => {
    server.use(
      http[method](apiUrl('/rooms/:id?'), () => HttpResponse.json(body, { status }), {
        once: true,
      }),
    );
  };

  describe('a new room', () => {
    it('is a dialog titled "New room" with the form for the details, filled with defaults', async () => {
      const { dialog } = await open();

      expect(dialog).toHaveAccessibleName('New room');
      expect(field.location()).toHaveTextContent('Choose a location');
      expect(field.name()).toHaveValue('');
      expect(field.type()).toHaveTextContent('Meeting room');
      expect(field.capacity()).toHaveValue(6);
      expect(field.rate()).toHaveValue(25);
      expect(field.amenities()).toHaveTextContent('None');
      expect(field.status()).toHaveTextContent('Available');
    });

    it('shows the units of the numbers: seats, euros per hour', async () => {
      const { dialog } = await open();

      expect(within(dialog).getByText('seats')).toBeInTheDocument();
      expect(within(dialog).getByText('/ hour')).toBeInTheDocument();
      expect(within(dialog).getByText('€')).toBeInTheDocument();
    });

    it('marks the location, the name and the numbers as required', async () => {
      await open();

      for (const control of [field.location, field.name, field.capacity, field.rate]) {
        expect(control()).toBeRequired();
      }
    });

    it('opens with focus in the first field, the location', async () => {
      await open();

      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
      });
    });

    it('offers the locations the API lists, by name', async () => {
      await open();

      await userEvent.click(field.location());

      const options = await screen.findAllByRole('option');
      expect(options.map((o) => o.textContent.trim())).toEqual(
        api.db.locations.map((l) => l.name).sort((a, b) => a.localeCompare(b)),
      );
    });

    it.each([
      ['type', ['Meeting room', 'Private office', 'Hot desk', 'Event space']],
      ['status', ['Available', 'Maintenance', 'Retired']],
      [
        'amenities',
        [
          'Projector',
          'Whiteboard',
          'Video conferencing',
          'Phone',
          'Standing desks',
          'Natural light',
        ],
      ],
    ] as const)('offers these choices for the %s', async (name, labels) => {
      await open();

      await userEvent.click(field[name]());

      expect((await screen.findAllByRole('option')).map((o) => o.textContent.trim())).toEqual(
        labels,
      );
    });

    it('cannot be saved until it is valid', async () => {
      await open();
      expect(save()).toBeDisabled();

      await choose(field.location(), 'Canal Yard');
      expect(save()).toBeDisabled();

      await userEvent.type(field.name(), 'Harbour Room');
      expect(save()).toBeEnabled();
    });

    it('creates the room, says so, closes and hands the new room on', async () => {
      const { opener } = await open();
      await fillNew();
      await choose(field.type(), 'Hot desk');
      await replace(field.capacity(), '12');
      await replace(field.rate(), '12.5');
      await userEvent.click(field.amenities());
      await userEvent.click(await screen.findByRole('option', { name: 'Whiteboard' }));
      await userEvent.click(screen.getByRole('option', { name: 'Projector' }));
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape', keyCode: 27 });
      await choose(field.status(), 'Maintenance');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const created = api.db.rooms.find((r) => r.name === 'Harbour Room');
      expect(created).toEqual({
        id: created?.id,
        locationId: 'loc_4',
        name: 'Harbour Room',
        type: 'hot_desk',
        capacity: 12,
        hourlyRate: 1250,
        amenities: ['projector', 'whiteboard'],
        status: 'maintenance',
      });
      expect(opener.results).toEqual([
        expect.objectContaining({ id: created?.id, locationName: 'Canal Yard' }),
      ]);
      expect(requests).toEqual(['POST /api/v1/rooms']);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Room created: Harbour Room');
    });

    it('sends the defaults for what was not touched, and trimmed text', async () => {
      await open();
      await choose(field.location(), 'Canal Yard');
      await userEvent.type(field.name(), '  Harbour Room ');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.rooms.at(-1)?.name).toBe('Harbour Room');
      });
      expect(api.db.rooms.at(-1)).toMatchObject({
        type: 'meeting_room',
        capacity: 6,
        hourlyRate: 2500,
        amenities: [],
        status: 'available',
      });
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

    it('says so, under the location, when the locations cannot be loaded', async () => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({ message: 'Boom' }, { status: 500 }),
        ),
      );
      await open();

      expect(
        await screen.findByText('The locations could not be loaded. Close the form and try again.'),
      ).toBeInTheDocument();
      expect(field.location()).toHaveAccessibleDescription(
        'The locations could not be loaded. Close the form and try again.',
      );
    });
  });

  describe('an existing room', () => {
    it('is titled with the name and starts from the saved values, the rate in euros', async () => {
      const { dialog } = await open({ editing: true });
      const saved = savedRoom();

      expect(dialog).toHaveAccessibleName(`Edit ${saved.name}`);
      await vi.waitFor(() => {
        expect(field.location()).toHaveTextContent(saved.locationName);
      });
      expect(field.name()).toHaveValue(saved.name);
      expect(field.type()).toHaveTextContent(humanize(saved.type));
      expect(field.capacity()).toHaveValue(saved.capacity);
      expect(field.rate()).toHaveValue(saved.hourlyRate / 100);
      expect(field.amenities()).toHaveTextContent(
        [
          'projector',
          'whiteboard',
          'video_conferencing',
          'phone',
          'standing_desks',
          'natural_light',
        ]
          .filter((a) => saved.amenities.includes(a as never))
          .map(humanize)
          .join(', '),
      );
      expect(field.status()).toHaveTextContent(humanize(saved.status));
    });

    it('cannot be saved while nothing is changed, and can once something is', async () => {
      await open({ editing: true });
      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
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

    it('is not changed by amenities that the API listed in another order', async () => {
      const room = { ...savedRoom(), amenities: ['phone', 'projector'] as Room['amenities'] };
      await open({ editing: true, room });

      expect(field.amenities()).toHaveTextContent('Projector, Phone');
      expect(save()).toBeDisabled();
    });

    it('saves the whole room, says so, closes and hands the saved room on', async () => {
      const { opener } = await open({ editing: true });
      const saved = savedRoom();

      await replace(field.name(), 'Atlas North');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(opener.results[0]).toMatchObject({ id: saved.id, name: 'Atlas North' });
      const { locationName: _name, ...record } = saved;
      expect(api.db.rooms[0]).toEqual({ ...record, name: 'Atlas North' });
      expect(requests).toEqual([`PATCH /api/v1/rooms/${saved.id}`]);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Room updated: Atlas North');
    });

    it('moves the room to another location, and changes its amenities and rate', async () => {
      const { opener } = await open({ editing: true, room: { ...savedRoom(), amenities: [] } });

      await choose(field.location(), 'Harbour Studio');
      await replace(field.rate(), '32.5');
      await userEvent.click(field.amenities());
      await userEvent.click(await screen.findByRole('option', { name: 'Natural light' }));
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape', keyCode: 27 });
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.rooms[0]).toMatchObject({
        locationId: 'loc_5',
        hourlyRate: 3250,
        amenities: ['natural_light'],
      });
    });

    it('keeps the room’s own location as a choice when the API’s list does not include it', async () => {
      server.use(
        http.get(apiUrl('/locations'), () =>
          HttpResponse.json({
            items: [{ ...api.db.locations[1], roomCount: 1 }],
            total: 1,
            page: 1,
            limit: 100,
          }),
        ),
      );
      await open({ editing: true });
      const saved = savedRoom();

      await vi.waitFor(() => {
        expect(field.location()).toHaveTextContent(saved.locationName);
      });
      await userEvent.click(field.location());
      expect((await screen.findAllByRole('option')).map((o) => o.textContent.trim())).toEqual([
        saved.locationName,
        api.db.locations[1].name,
      ]);
    });

    it('asks for a new location when the room’s own no longer exists', async () => {
      const saved = savedRoom();
      api.db.locations = api.db.locations.filter((l) => l.id !== saved.locationId);
      await open({ editing: true, room: { ...saved, locationName: '—' } });

      await vi.waitFor(() => {
        expect(field.location()).toHaveTextContent('Choose a location');
      });
      expect(save()).toBeDisabled();
      await userEvent.click(field.location());
      expect(screen.queryByRole('option', { name: '—' })).not.toBeInTheDocument();
      await userEvent.click(screen.getAllByRole('option')[0]);

      expect(save()).toBeEnabled();
    });

    it('does not send the stale location of such a room, but asks for one under the field', async () => {
      const saved = savedRoom();
      api.db.locations = api.db.locations.filter((l) => l.id !== saved.locationId);
      await open({ editing: true, room: { ...saved, locationName: '—' } });

      await userEvent.type(field.name(), 'x');
      expect(save()).toBeDisabled();
      await userEvent.keyboard('{Enter}');

      expect(field.location()).toHaveAccessibleDescription('Choose a location');
      expect(requests).toEqual([]);
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

    it('takes the error away when the value is fixed', async () => {
      await open();
      await userEvent.type(field.name(), 'a');
      await userEvent.tab();

      await userEvent.type(field.name(), 'b');

      expect(field.name()).toBeValid();
      expect(field.name()).not.toHaveAccessibleDescription('At least 2 characters');
    });

    it('asks for a location once the field was visited and left empty', async () => {
      await open();
      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
      });

      await userEvent.tab();

      await vi.waitFor(() => {
        expect(field.location()).toHaveAccessibleDescription('Choose a location');
      });
      expect(field.location()).toBeInvalid();
      expect(save()).toBeDisabled();
    });

    it('asks for at least one seat', async () => {
      await open();

      await replace(field.capacity(), '0');
      await userEvent.tab();

      expect(screen.getByText('At least 1 seat')).toBeInTheDocument();
      expect(field.capacity()).toBeInvalid();
    });

    it('asks for at most 200 seats, and for whole seats', async () => {
      await open();

      await replace(field.capacity(), '201');
      await userEvent.tab();
      expect(field.capacity()).toBeInvalid();
      expect(field.capacity()).toHaveAccessibleDescription(/200/);

      await replace(field.capacity(), '2.5');
      expect(field.capacity()).toHaveAccessibleDescription('Enter a whole number');

      await replace(field.capacity(), '200');
      expect(field.capacity()).toBeValid();
    });

    it('asks for the number of seats when the field is emptied', async () => {
      await open();

      await userEvent.clear(field.capacity());
      await userEvent.tab();

      expect(screen.getByText('Enter the number of seats')).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('does not take a negative rate', async () => {
      await open();

      await replace(field.rate(), '-5');
      await userEvent.tab();

      expect(screen.getByText('Cannot be negative')).toBeInTheDocument();
      expect(field.rate()).toBeInvalid();
    });

    it('asks for a rate when the field is emptied, but takes a free room', async () => {
      await open();
      await fillNew();

      await userEvent.clear(field.rate());
      await userEvent.tab();
      expect(screen.getByText('Enter a rate')).toBeInTheDocument();
      expect(save()).toBeDisabled();

      await replace(field.rate(), '0');
      expect(save()).toBeEnabled();
    });

    it('does not take fractions of a cent, and takes a rate to the cent', async () => {
      await open();
      await fillNew();

      await replace(field.rate(), '19.999');
      await userEvent.tab();
      expect(screen.getByText('Use at most 2 decimals')).toBeInTheDocument();
      expect(save()).toBeDisabled();

      await replace(field.rate(), '19.99');
      expect(save()).toBeEnabled();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(api.db.rooms.at(-1)?.hourlyRate).toBe(1999);
      });
    });

    it('does not take a rate above the limit', async () => {
      await open();

      await replace(field.rate(), '10001');
      await userEvent.tab();

      expect(screen.getByText('At most €10,000.00')).toBeInTheDocument();
    });

    it('shows what is wrong, focuses the first problem and sends nothing when Enter is pressed in an invalid form', async () => {
      await open();
      await choose(field.location(), 'Canal Yard');
      await userEvent.type(field.name(), 'L');
      await userEvent.click(field.rate());

      await userEvent.keyboard('{Enter}');

      expect(field.name()).toHaveAccessibleDescription('At least 2 characters');
      expect(field.name()).toHaveFocus();
      expect(requests).toEqual([]);
    });

    it('shows what is wrong, and focuses the first problem, when the form itself is submitted while invalid', async () => {
      const { dialog } = await open();
      await choose(field.location(), 'Canal Yard');
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);

      expect(await screen.findByText('At least 2 characters')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.name()).toHaveFocus();
      });
      expect(requests).toEqual([]);
    });
  });

  describe('when the server refuses with field errors (422)', () => {
    const FIELD_ERRORS = {
      message: 'Validation failed',
      fieldErrors: { name: 'This name is already used', locationId: 'Location not found' },
    };

    it('shows each message under its field, keeps the dialog open and says nothing else', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);

      await userEvent.click(save());

      expect(await screen.findByText('This name is already used')).toBeInTheDocument();
      expect(screen.getByText('Location not found')).toBeInTheDocument();
      expect(field.name()).toHaveAccessibleDescription('This name is already used');
      expect(field.location()).toHaveAccessibleDescription('Location not found');
      expect(field.name()).toBeInvalid();
      expect(field.capacity()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
    });

    it('moves focus to the first field with an error', async () => {
      await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);

      await userEvent.click(save());

      await screen.findByText('This name is already used');
      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
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
      expect(screen.getByText('Location not found')).toBeInTheDocument();
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
      await choose(field.location(), 'Harbour Studio');

      expect(save()).toBeEnabled();
    });

    it('saves after the person corrects the fields', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);
      await userEvent.click(save());
      await screen.findByText('This name is already used');

      await replace(field.name(), 'Harbour Room Two');
      await choose(field.location(), 'Harbour Studio');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.rooms.at(-1)).toMatchObject({ name: 'Harbour Room Two', locationId: 'loc_5' });
    });

    it('shows the message of a rate or a seat count the server refuses under that field', async () => {
      await open();
      await fillNew();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { hourlyRate: 'Rate is not allowed here', capacity: 'No room for that' },
      });

      await userEvent.click(save());

      expect(await screen.findByText('Rate is not allowed here')).toBeInTheDocument();
      expect(field.rate()).toHaveAccessibleDescription('Rate is not allowed here');
      expect(field.capacity()).toHaveAccessibleDescription('No room for that');
      await vi.waitFor(() => {
        expect(field.capacity()).toHaveFocus();
      });
    });

    it('puts a message for the form as a whole, or for a field the form lacks, in a banner', async () => {
      await open();
      await fillNew();
      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { _: 'The request is not acceptable', floor: 'Unknown floor' },
      });

      await userEvent.click(save());

      const banner = await screen.findByRole('alert');
      expect(banner).toHaveTextContent('The request is not acceptable');
      expect(banner).toHaveTextContent('Unknown floor');
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

    it('is told, by the real API, that a location that was deleted meanwhile is not found', async () => {
      await open();
      await fillNew();
      api.db.locations = api.db.locations.filter((l) => l.id !== 'loc_4');

      await userEvent.click(save());

      expect(await screen.findByText('Location not found')).toBeInTheDocument();
      expect(field.location()).toBeInvalid();
    });
  });

  describe('when the server refuses otherwise', () => {
    it('shows a conflict (409) in a banner, keeps the dialog open and the snackbar out of it', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this room' });

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Another admin changed this room');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
    });

    it('moves focus to the first field after a banner, which the disabled fields had lost', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this room' });

      await userEvent.click(save());

      await screen.findByRole('alert');
      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
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
      expect(api.db.rooms.at(-1)?.name).toBe('Harbour Room');
    });

    it('drops an old banner when the retry is refused with field errors', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this room' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      refuse(422, {
        message: 'Validation failed',
        fieldErrors: { name: 'This name is already used' },
      });
      await userEvent.click(save());

      await screen.findByText('This name is already used');
      expect(screen.queryByText('Another admin changed this room')).not.toBeInTheDocument();
    });

    it('takes the banner away with the first edit, and the form can be saved again', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this room' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      await userEvent.type(field.name(), '!');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(save()).toBeEnabled();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('says so when the room was deleted meanwhile (404)', async () => {
      await open({ editing: true });
      api.db.rooms.shift();
      await replace(field.name(), 'Atlas North');

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Room not found');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says so when the server cannot be reached', async () => {
      await open();
      await fillNew();
      server.use(http.post(apiUrl('/rooms'), () => HttpResponse.error(), { once: true }));

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.location()).toHaveFocus();
      });
      expect(save()).toBeEnabled();
    });

    it('says what failed when a server error carries no message of its own', async () => {
      await open();
      await fillNew();
      server.use(
        http.post(
          apiUrl('/rooms'),
          () => new HttpResponse('<html>bad gateway</html>', { status: 502 }),
          { once: true },
        ),
      );

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    });
  });

  describe('while saving', () => {
    beforeEach(() => {
      server.use(
        http.post(apiUrl('/rooms'), async () => {
          await delay(150);
          return HttpResponse.json(
            { ...savedRoom(), id: 'room_new', name: 'Harbour Room' },
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
      expect(requests).toEqual(['POST /api/v1/rooms']);
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
      await choose(field.location(), 'Canal Yard');
      await userEvent.type(field.name(), 'Harbour Room{Enter}');

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(requests).toEqual(['POST /api/v1/rooms']);
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
        expect(field.location()).toHaveFocus();
      });

      fireEvent.keyDown(field.location(), { key: 'Escape', keyCode: 27 });

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
    });
  });
});
