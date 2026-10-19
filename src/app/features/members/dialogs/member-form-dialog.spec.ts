import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { type Member, memberFullName } from '@shared/api/contract';
import { installMockApi, signIn } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { delay, http, HttpResponse } from 'msw';
import { injectMemberFormDialog } from './open-member-form';

@Component({
  template: `
    <button type="button" (click)="open()">Open form</button>
    <button type="button" (click)="open(member)">Open edit form</button>
  `,
})
class Opener {
  private readonly openForm = injectMemberFormDialog();
  member: Member | undefined;
  results: (Member | undefined)[] = [];
  async open(member?: Member) {
    this.results.push(await this.openForm(member));
  }
}

describe('MemberFormDialog', () => {
  // The first open fetches the form's chunk (Material select, time picker, Zod). Doing it here
  // keeps that one-off cost out of the first test, which would otherwise race the 5 s wait.
  beforeAll(async () => {
    await import('./member-form-dialog');
  });

  let api: ReturnType<typeof installMockApi>;
  let requests: string[];

  beforeEach(() => {
    api = installMockApi();
    signIn();
    api.db.members[0].company = 'Pereira & Co';
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
    if (editing) opener.member = savedMember();
    await userEvent.click(
      screen.getByRole('button', { name: editing ? 'Open edit form' : 'Open form' }),
    );
    const dialog = await screen.findByRole('dialog', { name: editing ? /^Edit / : 'New member' });
    return { ...view, opener, dialog };
  }

  /** The first seeded member, which `beforeEach` gives a company so that clearing it is a change. */
  const savedMember = (): Member => ({ ...api.db.members[0] });

  const snackbars = () =>
    TestBed.inject(OverlayContainer)
      .getContainerElement()
      .querySelectorAll('mat-snack-bar-container');

  /** The controls of the open dialog, by their labels. */
  const field = {
    firstName: () => screen.getByRole('textbox', { name: /^First name/ }),
    lastName: () => screen.getByRole('textbox', { name: /^Last name/ }),
    email: () => screen.getByRole('textbox', { name: /^Email/ }),
    phone: () => screen.getByRole('textbox', { name: /^Phone/ }),
    company: () => screen.getByRole('textbox', { name: /^Company/ }),
    plan: () => screen.getByRole('combobox', { name: /^Plan/ }),
    status: () => screen.getByRole('combobox', { name: /^Status/ }),
  };
  const save = () => screen.getByRole('button', { name: /^Save|Saving/ });

  async function replace(control: HTMLElement, text: string) {
    await userEvent.clear(control);
    await userEvent.type(control, text);
  }

  async function fillNew() {
    await userEvent.type(field.firstName(), 'Ana');
    await userEvent.type(field.lastName(), 'Pereira');
    await userEvent.type(field.email(), 'ana.pereira@example.com');
    await userEvent.type(field.phone(), '+351 21 555 01 99');
  }

  const refuse = (status: number, body: object, method: 'post' | 'patch' = 'post') => {
    server.use(
      http[method](apiUrl('/members/:id?'), () => HttpResponse.json(body, { status }), {
        once: true,
      }),
    );
  };

  describe('a new member', () => {
    it('is a dialog titled "New member" with the form for the details', async () => {
      const { dialog } = await open();

      expect(dialog).toHaveAccessibleName('New member');
      expect(field.firstName()).toHaveValue('');
      expect(field.lastName()).toHaveValue('');
      expect(field.email()).toHaveValue('');
      expect(field.phone()).toHaveValue('');
      expect(field.company()).toHaveValue('');
      expect(field.plan()).toHaveTextContent('Flex');
      expect(field.status()).toHaveTextContent('Active');
    });

    it('marks the names, the email and the phone as required, and the company as optional', async () => {
      await open();

      for (const control of [field.firstName, field.lastName, field.email, field.phone]) {
        expect(control()).toBeRequired();
      }
      expect(field.company()).not.toBeRequired();
    });

    it('lets a phone or an email keyboard come up, and leaves the browser’s own details out', async () => {
      await open();

      expect(field.email()).toHaveAttribute('type', 'email');
      expect(field.email()).toHaveAttribute('inputmode', 'email');
      expect(field.phone()).toHaveAttribute('type', 'tel');
      expect(field.phone()).toHaveAttribute('inputmode', 'tel');
      expect(field.phone()).toHaveAttribute('placeholder', '+380 44 123 45 67');
      for (const control of [field.firstName, field.lastName, field.email, field.phone]) {
        expect(control()).toHaveAttribute('autocomplete', 'off');
      }
    });

    it('offers the plans and the statuses in words', async () => {
      await open();

      await userEvent.click(field.plan());
      expect(screen.getAllByRole('option').map((o) => o.textContent.trim())).toEqual([
        'Day pass',
        'Flex',
        'Dedicated',
        'Team',
      ]);
      await userEvent.click(screen.getByRole('option', { name: 'Flex' }));
      await userEvent.click(field.status());
      expect(screen.getAllByRole('option').map((o) => o.textContent.trim())).toEqual([
        'Active',
        'Suspended',
        'Cancelled',
      ]);
    });

    it('opens with the cursor in the first field', async () => {
      await open();

      await vi.waitFor(() => {
        expect(field.firstName()).toHaveFocus();
      });
    });

    it('cannot be saved until it is valid', async () => {
      await open();
      expect(save()).toBeDisabled();

      await userEvent.type(field.firstName(), 'Ana');
      await userEvent.type(field.lastName(), 'Pereira');
      await userEvent.type(field.email(), 'ana.pereira@example.com');
      expect(save()).toBeDisabled();

      await userEvent.type(field.phone(), '+351 21 555 01 99');
      expect(save()).toBeEnabled();
    });

    it('creates the member, says so, closes and hands the new member on', async () => {
      const { opener } = await open();
      await fillNew();
      await userEvent.type(field.company(), 'Pereira & Co');
      await userEvent.click(field.plan());
      await userEvent.click(screen.getByRole('option', { name: 'Team' }));
      await userEvent.click(field.status());
      await userEvent.click(screen.getByRole('option', { name: 'Suspended' }));

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const created = api.db.members.find((m) => m.email === 'ana.pereira@example.com');
      expect(created).toMatchObject({
        firstName: 'Ana',
        lastName: 'Pereira',
        phone: '+351 21 555 01 99',
        company: 'Pereira & Co',
        plan: 'team',
        status: 'suspended',
      });
      expect(opener.results).toEqual([
        expect.objectContaining({ id: created?.id, firstName: 'Ana' }),
      ]);
      expect(requests).toEqual(['POST /api/v1/members']);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent('Member added: Ana Pereira');
    });

    it('sends no company as null', async () => {
      await open();
      await fillNew();
      await userEvent.type(field.company(), '   ');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.members.at(-1)?.email).toBe('ana.pereira@example.com');
      });
      expect(api.db.members.at(-1)?.company).toBeNull();
    });

    it('sends trimmed text and stores the email in lower case', async () => {
      await open();
      await userEvent.type(field.firstName(), '  Ana ');
      await userEvent.type(field.lastName(), ' Pereira  ');
      await userEvent.type(field.email(), ' Ana.Pereira@Example.com ');
      await userEvent.type(field.phone(), '+351 21 555 01 99');

      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(api.db.members.at(-1)?.firstName).toBe('Ana');
      });
      expect(api.db.members.at(-1)).toMatchObject({
        lastName: 'Pereira',
        email: 'ana.pereira@example.com',
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
  });

  describe('an existing member', () => {
    it('is titled with the full name and starts from the saved values', async () => {
      const { dialog } = await open({ editing: true });
      const saved = savedMember();

      expect(dialog).toHaveAccessibleName(`Edit ${memberFullName(saved)}`);
      expect(field.firstName()).toHaveValue(saved.firstName);
      expect(field.lastName()).toHaveValue(saved.lastName);
      expect(field.email()).toHaveValue(saved.email);
      expect(field.phone()).toHaveValue(saved.phone);
      expect(field.company()).toHaveValue('Pereira & Co');
    });

    it('shows a member without a company as an empty field', async () => {
      api.db.members[0].company = null;
      await open({ editing: true });

      expect(field.company()).toHaveValue('');
      expect(save()).toBeDisabled();
    });

    it('cannot be saved while nothing is changed, and can once something is', async () => {
      await open({ editing: true });
      await vi.waitFor(() => {
        expect(field.firstName()).toHaveFocus();
      });
      expect(save()).toBeDisabled();

      await userEvent.type(field.firstName(), 'x');
      expect(save()).toBeEnabled();
    });

    it('cannot be saved again once a change is taken back', async () => {
      await open({ editing: true });

      await userEvent.type(field.firstName(), 'x');
      expect(save()).toBeEnabled();
      await userEvent.type(field.firstName(), '{Backspace}');

      expect(save()).toBeDisabled();
    });

    it('saves the whole member, says so, closes and hands the saved member on', async () => {
      const { opener } = await open({ editing: true });
      const saved = savedMember();

      await replace(field.firstName(), 'Ana');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(opener.results[0]).toMatchObject({ id: saved.id, firstName: 'Ana' });
      expect(api.db.members[0]).toMatchObject({
        firstName: 'Ana',
        lastName: saved.lastName,
        email: saved.email,
        phone: saved.phone,
        company: 'Pereira & Co',
        plan: saved.plan,
        status: saved.status,
        joinedAt: saved.joinedAt,
      });
      expect(requests).toEqual([`PATCH /api/v1/members/${saved.id}`]);
      await vi.waitFor(() => {
        expect(snackbars()).toHaveLength(1);
      });
      expect(snackbars()[0]).toHaveTextContent(`Member updated: Ana ${saved.lastName}`);
    });

    it('takes the company away when the field is emptied', async () => {
      const { opener } = await open({ editing: true });

      await userEvent.clear(field.company());
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.members[0].company).toBeNull();
    });

    it('keeps its own email without calling it a duplicate when something else is changed', async () => {
      const { opener } = await open({ editing: true });

      await replace(field.phone(), '+380 44 123 45 67');
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(screen.queryByText('This email is already registered')).not.toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows no error before a field is touched, and words it once the field is left', async () => {
      await open();

      await userEvent.type(field.firstName(), ' ');
      expect(screen.queryByText('Required')).not.toBeInTheDocument();
      await userEvent.tab();

      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(field.firstName()).toHaveAccessibleDescription('Required');
      expect(field.firstName()).toBeInvalid();
    });

    it('asks for an email that looks like one', async () => {
      await open();

      await userEvent.type(field.email(), 'ana@');
      await userEvent.tab();

      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
      expect(field.email()).toHaveAccessibleDescription('Enter a valid email');
    });

    it('asks for a phone number that looks like one', async () => {
      await open();

      await userEvent.type(field.phone(), 'call me');
      await userEvent.tab();

      expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument();
      expect(field.phone()).toBeInvalid();
    });

    it('takes the error away when the value is fixed', async () => {
      await open();
      await userEvent.type(field.email(), 'ana@');
      await userEvent.tab();

      await userEvent.type(field.email(), 'example.com');

      expect(field.email()).toBeValid();
      expect(field.email()).not.toHaveAccessibleDescription('Enter a valid email');
    });

    it('shows what is wrong, focuses the first problem and sends nothing when Enter is pressed in an invalid form', async () => {
      await open();
      await userEvent.type(field.lastName(), 'Pereira');

      await userEvent.keyboard('{Enter}');

      expect(screen.getAllByText('Required')).toHaveLength(1);
      expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
      expect(screen.getByText('Enter a valid phone number')).toBeInTheDocument();
      expect(field.firstName()).toHaveFocus();
      expect(requests).toEqual([]);
    });

    it('shows what is wrong, and focuses the first problem, when the form itself is submitted while invalid', async () => {
      const { dialog } = await open();
      await userEvent.type(field.firstName(), 'Ana');
      await userEvent.type(field.lastName(), 'Pereira');
      const form = dialog.querySelector('form');
      if (!form) throw new Error('The dialog has no form');

      fireEvent.submit(form);

      expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.email()).toHaveFocus();
      });
      expect(requests).toEqual([]);
    });
  });

  describe('an email that is already registered', () => {
    const takenEmail = () => api.db.members[0].email;

    it('shows the API’s refusal under Email, keeps the dialog open and says nothing else', async () => {
      const { opener } = await open();
      await fillNew();
      await replace(field.email(), takenEmail().toUpperCase());

      await userEvent.click(save());

      expect(await screen.findByText('This email is already registered')).toBeInTheDocument();
      expect(field.email()).toHaveAccessibleDescription('This email is already registered');
      expect(field.email()).toBeInvalid();
      expect(field.phone()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
      expect(screen.getAllByRole('alert').map((a) => a.textContent.trim())).toEqual([
        'This email is already registered',
      ]);
      expect(api.db.members).toHaveLength(80);
    });

    it('moves focus to the Email field', async () => {
      await open();
      await fillNew();
      await replace(field.email(), takenEmail());

      await userEvent.click(save());

      await screen.findByText('This email is already registered');
      await vi.waitFor(() => {
        expect(field.email()).toHaveFocus();
      });
    });

    it('cannot be saved again until the email is changed, and then saves', async () => {
      const { opener } = await open();
      await fillNew();
      await replace(field.email(), takenEmail());
      await userEvent.click(save());
      await screen.findByText('This email is already registered');
      expect(save()).toBeDisabled();

      await userEvent.type(field.phone(), '1');
      expect(save()).toBeDisabled();
      await replace(field.email(), 'ana.pereira@example.com');
      expect(screen.queryByText('This email is already registered')).not.toBeInTheDocument();
      await userEvent.click(save());

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(api.db.members.at(-1)?.email).toBe('ana.pereira@example.com');
    });

    it('is refused on an edit too, when the email is another member’s', async () => {
      await open({ editing: true });
      await replace(field.email(), api.db.members[1].email);

      await userEvent.click(save());

      expect(await screen.findByText('This email is already registered')).toBeInTheDocument();
      expect(snackbars()).toHaveLength(0);
      expect(api.db.members[0].email).not.toBe(api.db.members[1].email);
    });
  });

  describe('when the server refuses with other field errors (422)', () => {
    const FIELD_ERRORS = {
      message: 'Validation failed',
      fieldErrors: { lastName: 'Not a surname', phone: 'Unknown prefix' },
    };

    it('shows each message under its field, keeps the dialog open and says nothing else', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);

      await userEvent.click(save());

      expect(await screen.findByText('Not a surname')).toBeInTheDocument();
      expect(screen.getByText('Unknown prefix')).toBeInTheDocument();
      expect(field.lastName()).toHaveAccessibleDescription('Not a surname');
      expect(field.phone()).toHaveAccessibleDescription('Unknown prefix');
      expect(field.firstName()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
    });

    it('moves focus to the first field with an error', async () => {
      await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);

      await userEvent.click(save());

      await screen.findByText('Not a surname');
      await vi.waitFor(() => {
        expect(field.lastName()).toHaveFocus();
      });
    });

    it('takes a message away when its field is edited, and keeps the other', async () => {
      await open();
      await fillNew();
      refuse(422, FIELD_ERRORS);
      await userEvent.click(save());
      await screen.findByText('Not a surname');

      await userEvent.type(field.lastName(), '2');

      expect(screen.queryByText('Not a surname')).not.toBeInTheDocument();
      expect(screen.getByText('Unknown prefix')).toBeInTheDocument();
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
  });

  describe('when the server refuses otherwise', () => {
    it('shows a conflict (409) in a banner, keeps the dialog open and the snackbar out of it', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this member' });

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Another admin changed this member',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(opener.results).toEqual([]);
      expect(snackbars()).toHaveLength(0);
    });

    it('moves focus to the first field after a banner, which the disabled fields had lost', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this member' });

      await userEvent.click(save());

      await screen.findByRole('alert');
      await vi.waitFor(() => {
        expect(field.firstName()).toHaveFocus();
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
      expect(api.db.members.at(-1)?.email).toBe('ana.pereira@example.com');
    });

    it('drops an old banner when the retry is refused with field errors', async () => {
      await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this member' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      refuse(422, { message: 'Validation failed', fieldErrors: { lastName: 'Not a surname' } });
      await userEvent.click(save());

      await screen.findByText('Not a surname');
      expect(screen.queryByText('Another admin changed this member')).not.toBeInTheDocument();
    });

    it('takes the banner away with the first edit, and the form can be saved again', async () => {
      const { opener } = await open();
      await fillNew();
      refuse(409, { message: 'Another admin changed this member' });
      await userEvent.click(save());
      await screen.findByRole('alert');

      await userEvent.type(field.company(), 'Pereira & Co');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(save()).toBeEnabled();
      await userEvent.click(save());
      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
    });

    it('says so when the member was removed meanwhile (404)', async () => {
      await open({ editing: true });
      api.db.members.shift();
      await replace(field.firstName(), 'Ana');

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Member not found');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('says so when the server cannot be reached', async () => {
      await open();
      await fillNew();
      server.use(http.post(apiUrl('/members'), () => HttpResponse.error(), { once: true }));

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await vi.waitFor(() => {
        expect(field.firstName()).toHaveFocus();
      });
      expect(save()).toBeEnabled();
    });

    it('says what failed when a server error carries no message of its own', async () => {
      await open();
      await fillNew();
      server.use(
        http.post(
          apiUrl('/members'),
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
        http.post(apiUrl('/members'), async () => {
          await delay(150);
          return HttpResponse.json(
            { ...savedMember(), id: 'mem_new', firstName: 'Ana' },
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
      expect(field.firstName()).toBeDisabled();
      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(requests).toEqual(['POST /api/v1/members']);
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

      await userEvent.type(field.company(), '{Enter}');

      await vi.waitFor(() => {
        expect(opener.results).toHaveLength(1);
      });
      expect(requests).toEqual(['POST /api/v1/members']);
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
        expect(field.firstName()).toHaveFocus();
      });

      fireEvent.keyDown(field.firstName(), { key: 'Escape', keyCode: 27 });

      await vi.waitFor(() => {
        expect(opener.results).toEqual([undefined]);
      });
    });
  });
});
