import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { SessionStore } from '@core/auth/session-store';
import { TOKEN_KEY } from '@core/auth/session-token';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { installMockApi } from '@testing/mock-api';
import { apiUrl, server } from '@testing/msw-server';
import { provideTestSession } from '@testing/test-providers';
import { http, HttpResponse } from 'msw';
import { UserMenu } from './user-menu';

@Component({ template: '<h1>Sign-in page</h1>' })
class LoginStub {}

describe('UserMenu', () => {
  beforeEach(() => {
    installMockApi();
  });

  async function open(signedIn = true) {
    const view = await render(UserMenu, {
      providers: provideTestSession([{ path: '**', component: LoginStub }]),
    });
    const session = TestBed.inject(SessionStore);
    if (signedIn) {
      await session.login({ email: 'manager@coworking.test', password: 'demo1234' });
      view.fixture.detectChanges();
    }
    return { ...view, session };
  }

  const trigger = () => screen.getByRole('button', { name: 'Account menu' });

  it('has a button named for what it opens', async () => {
    await open();

    expect(trigger()).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('describes the button with who is signed in, for a screen reader', async () => {
    await open();

    expect(trigger()).toHaveAccessibleDescription(
      'Signed in as Sam Rivera, manager@coworking.test',
    );
  });

  it('shows who is signed in and offers to sign out', async () => {
    await open();

    await userEvent.click(trigger());

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Sam Rivera');
    expect(menu).toHaveTextContent('manager@coworking.test');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('opens from the keyboard and puts focus on the first item', async () => {
    await open();
    trigger().focus();

    await userEvent.keyboard('{Enter}');

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    });
  });

  it('closes on Escape and gives focus back to the button', async () => {
    await open();
    await userEvent.click(trigger());
    const item = await screen.findByRole('menuitem', { name: 'Sign out' });

    // The CDK reads the legacy `keyCode`, which `userEvent.keyboard` leaves at 0.
    fireEvent.keyDown(item, { key: 'Escape', keyCode: 27 });

    await vi.waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    expect(trigger()).toHaveFocus();
  });

  it('signs out: the session is gone and the sign-in page is shown', async () => {
    const { session } = await open();
    await userEvent.click(trigger());

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await vi.waitFor(() => {
      expect(TestBed.inject(Router).url).toBe('/login');
    });
    expect(session.token()).toBeNull();
    expect(session.user()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('still offers to sign out when the user is not known', async () => {
    server.use(
      http.get(apiUrl('/auth/me'), () => HttpResponse.json({ message: 'Boom' }, { status: 500 })),
    );
    sessionStorage.setItem(TOKEN_KEY, 'demo-token.usr_admin');
    const { session, fixture } = await open(false);

    await session.loadUser();
    fixture.detectChanges();
    await userEvent.click(trigger());

    const menu = await screen.findByRole('menu');
    expect(session.token()).toBe('demo-token.usr_admin');
    expect(session.user()).toBeNull();
    expect(menu).toHaveTextContent('Signed in');
    expect(trigger()).toHaveAccessibleDescription('Signed in');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });
});
