import { ADMIN, expect, test } from './fixtures';
import { AppShell } from './pages/app-shell';
import { LoginPage } from './pages/login-page';
import { MembersPage } from './pages/members-page';
import { Notifications } from './pages/notifications';

test.describe('authentication', () => {
  test('sends a signed-out visitor to the login page and back after signing in', async ({
    page,
  }) => {
    const login = new LoginPage(page);
    await page.goto('/members');
    await expect(page).toHaveURL(/\/login/);
    await expect(login.heading).toBeVisible();

    await login.signIn(ADMIN.email, ADMIN.password);

    await expect(page).toHaveURL(/\/members$/);
    await expect(new MembersPage(page).heading).toBeVisible();
  });

  test('shows a wrong password inside the form, not in a snack bar', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await login.signIn(ADMIN.email, 'not-the-password');

    await expect(login.failure).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login/);
    await expect(new Notifications(page).snackBars).toHaveCount(0);
    // The form is ready for another try, with the password where it was left.
    await expect(login.password).toBeFocused();
  });

  test('signs out, and a protected page then asks to sign in again', async ({ page }) => {
    const login = new LoginPage(page);
    const shell = new AppShell(page);
    await login.goto();
    await login.signIn(ADMIN.email, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    await shell.signOut();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login/);
    await expect(login.heading).toBeVisible();
  });

  test('keeps a signed-in visitor out of the login page', async ({ signedInPage: page }) => {
    await page.goto('/login');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('stays signed in when the page is reloaded', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.signIn(ADMIN.email, ADMIN.password);
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
