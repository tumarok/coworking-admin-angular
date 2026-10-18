import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatIconButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { MatToolbar } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppIcon } from '@shared/ui/app-icon';
import { filter, map } from 'rxjs';
import { APP_NAME } from './app-name';
import { NAV_ITEMS } from './nav-items';

/** Below this width the navigation becomes a drawer that opens over the page. */
const NARROW = '(max-width: 959.98px)';

/**
 * The frame around every signed-in page: a top bar, the navigation and the page itself.
 *
 * On a wide screen the navigation sits beside the page. On a narrow one it is a drawer opened
 * from the top bar: it traps focus while open, closes on Escape, on a click outside and after
 * a link is followed. A skip link lets keyboard users jump past the navigation to the page.
 */
@Component({
  selector: 'app-shell',
  imports: [
    AppIcon,
    MatIconButton,
    MatProgressBar,
    MatSidenav,
    MatSidenavContainer,
    MatSidenavContent,
    MatToolbar,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.narrow]': 'narrow()' },
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);

  protected readonly appName = APP_NAME;
  protected readonly navItems = NAV_ITEMS;
  protected readonly narrow = toSignal(
    inject(BreakpointObserver)
      .observe(NARROW)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  /**
   * Whether the drawer is open; on a wide screen the navigation is always shown. Crossing the
   * breakpoint starts over closed, so a drawer opened on a narrow screen does not come back open
   * after a trip to a wide one.
   */
  protected readonly drawerOpen = linkedSignal({ source: this.narrow, computation: () => false });
  /**
   * A different page is being loaded (its code, for a lazy route). A new query on the same page
   * is quick and the page stays as it is, so it shows no bar.
   */
  protected readonly navigating = computed(() => {
    const navigation = this.router.currentNavigation();
    return (
      navigation !== null &&
      pathOf(this.router.serializeUrl(navigation.extractedUrl)) !== pathOf(this.router.url)
    );
  });

  private readonly content = viewChild.required(MatSidenavContent);
  private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');

  constructor() {
    // The page scrolls inside the sidenav's content, not the window, so the router's scroll
    // restoration has nothing to reset. A new page starts at the top and takes focus (so the
    // keyboard and screen reader user starts at its content, not at the link they just used); a
    // new query on the same page (its next page of results) keeps both. The first navigation is
    // the one that brought the shell up: the browser already starts a page load at the top.
    let lastPath: string | undefined;
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const path = pathOf(event.urlAfterRedirects);
        if (lastPath !== undefined && path !== lastPath) {
          this.content().scrollTo({ top: 0 });
          this.page().nativeElement.focus({ preventScroll: true });
        }
        lastPath = path;
      });
  }

  protected skipToPage(event: Event): void {
    // A plain `#main` link would navigate the router to `/#main`.
    event.preventDefault();
    this.page().nativeElement.focus();
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}

const pathOf = (url: string) => url.split(/[?#]/)[0];
