import { daysFromToday, expect, test } from './fixtures';
import { MemberDetailsPage } from './pages/member-details-page';
import { MembersPage } from './pages/members-page';
import { Notifications } from './pages/notifications';
import { createBooking, createLocation, createMember, createRoom } from './support/data';

test.describe('members', () => {
  test('searches the list and filters by plan', async ({ signedInPage: page, api }) => {
    await createMember(api, {
      firstName: 'Zed',
      lastName: 'Zebra',
      email: 'zed@example.com',
      plan: 'team',
    });
    await createMember(api, {
      firstName: 'Zoe',
      lastName: 'Zebra',
      email: 'zoe@example.com',
      plan: 'day_pass',
    });
    const members = new MembersPage(page);
    await members.goto();

    await members.toolbar.search.fill('zebra');
    await expect(page).toHaveURL(/\/members\?q=zebra$/);
    await members.table.expectRows(2);

    await members.toolbar.choose('Plan', 'Team');
    await expect(page).toHaveURL(/plan=team/);
    await members.table.expectRows(1);
    await expect(members.table.link('Zed Zebra')).toBeVisible();
  });

  test('edits a member from their page', async ({ signedInPage: page, api }) => {
    const member = await createMember(api);
    const details = new MemberDetailsPage(page, 'Dana Testova');
    await details.goto(member.id);
    await expect(details.facts.value('Company')).toHaveText('—');

    const form = await details.openEditForm();
    await expect(form.save).toBeDisabled();
    await form.fill({
      company: 'Acme Labs',
      plan: 'Team',
      status: 'Suspended',
      phone: '+380 44 111 22 33',
    });
    await form.submitAndClose();

    await new Notifications(page).expectMessage('Member updated: Dana Testova');
    await expect(details.facts.value('Company')).toHaveText('Acme Labs');
    await expect(details.facts.value('Plan')).toHaveText('Team');
    await expect(details.facts.value('Status')).toHaveText('Suspended');
    await expect(details.facts.value('Phone')).toHaveText('+380 44 111 22 33');
    await expect(details.facts.value('Email')).toHaveText('dana.testova@example.com');
  });

  test('refuses an email that is already registered, under the field, and lets it be corrected', async ({
    signedInPage: page,
    api,
  }) => {
    await createMember(api);
    const members = new MembersPage(page);
    await members.goto();

    const form = await members.openNewMemberForm();
    await form.fill({
      firstName: 'Dan',
      lastName: 'Duplicate',
      email: 'dana.testova@example.com',
      phone: '+380 44 000 00 01',
    });
    await form.submit();

    await expect(form.alert('This email is already registered')).toBeVisible();
    await expect(form.dialog).toBeVisible();
    await expect(form.email).toBeFocused();

    await form.fill({ email: 'dan.duplicate@example.com' });
    await form.submitAndClose();
    await new Notifications(page).expectMessage('Member added: Dan Duplicate');
    await expect(page.getByRole('heading', { name: 'Dan Duplicate', level: 1 })).toBeVisible();
  });

  test('checks the form before sending it', async ({ signedInPage: page }) => {
    const members = new MembersPage(page);
    await members.goto();

    const form = await members.openNewMemberForm();
    await expect(form.save).toBeDisabled();
    await form.fill({ firstName: 'Dana', lastName: 'Testova', email: 'not-an-email', phone: '12' });
    await form.company.click();

    await expect(form.alert('Enter a valid email')).toBeVisible();
    await expect(form.alert('Enter a valid phone number')).toBeVisible();
    await expect(form.save).toBeDisabled();
  });

  test('removes a member after asking', async ({ signedInPage: page, api }) => {
    const member = await createMember(api);
    const details = new MemberDetailsPage(page, 'Dana Testova');
    await details.goto(member.id);

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage('Member removed: Dana Testova');
    await expect(page).toHaveURL(/\/members$/);
    const members = new MembersPage(page);
    await expect(members.heading).toBeVisible();
    await members.toolbar.search.fill('Testova');
    await members.table.expectEmpty();
  });

  test('refuses to remove a member who has upcoming bookings', async ({
    signedInPage: page,
    api,
  }) => {
    const location = await createLocation(api, { name: 'Rules Hub' });
    const room = await createRoom(api, location.id, { name: 'Onyx' });
    const member = await createMember(api);
    await createBooking(api, { roomId: room.id, memberId: member.id, day: daysFromToday(10) });
    const details = new MemberDetailsPage(page, 'Dana Testova');
    await details.goto(member.id);

    const question = await details.askToDelete();
    await question.confirm('Delete');

    await new Notifications(page).expectMessage(
      'This member has upcoming bookings; cancel them first',
    );
    await expect(page).toHaveURL(new RegExp(`/members/${member.id}$`));
    await expect(details.heading).toBeVisible();
  });
});
