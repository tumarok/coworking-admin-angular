import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { SessionStore } from '@core/auth/session-store';
import { AppIcon } from '@shared/ui/app-icon';

/**
 * The signed-in user in the top bar: their name and email, and the way to sign out. The menu is
 * Material's, so it opens with Enter or Space, moves with the arrow keys, closes on Escape and
 * returns focus to the button. When the API could not say who the user is (see `loadUser`), the
 * menu still offers the sign-out.
 */
@Component({
  selector: 'app-user-menu',
  imports: [AppIcon, MatIconButton, MatMenu, MatMenuItem, MatMenuTrigger],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      mat-icon-button
      type="button"
      aria-label="Account menu"
      aria-describedby="user-menu-description"
      [matMenuTriggerFor]="menu"
    >
      <app-icon name="account_circle" />
    </button>
    <span id="user-menu-description" class="visually-hidden">{{ description() }}</span>
    <mat-menu #menu="matMenu" xPosition="before">
      <div class="identity" role="none">
        <span class="name">{{ name() }}</span>
        @if (email(); as email) {
          <span class="email">{{ email }}</span>
        }
      </div>
      <button mat-menu-item type="button" (click)="signOut()">
        <app-icon name="logout" />
        <span>Sign out</span>
      </button>
    </mat-menu>
  `,
  styles: `
    .identity {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 1rem 0.75rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      margin-bottom: 0.5rem;
    }

    .name {
      font: var(--mat-sys-title-small);
    }

    .email {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }

    app-icon {
      margin-inline-end: 0.75rem;
    }
  `,
})
export class UserMenu {
  private readonly session = inject(SessionStore);

  protected readonly name = computed(() => this.session.user()?.name ?? 'Signed in');
  protected readonly email = computed(() => this.session.user()?.email ?? '');

  /** Who is signed in, for a screen reader: the menu's own identity is out of its arrow-key reach. */
  protected readonly description = computed(() => {
    const user = this.session.user();
    return user ? `Signed in as ${user.name}, ${user.email}` : 'Signed in';
  });

  protected signOut(): void {
    void this.session.logout();
  }
}
