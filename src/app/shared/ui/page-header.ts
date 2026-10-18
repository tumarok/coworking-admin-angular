import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppIcon } from './app-icon';

export interface BackLink {
  label: string;
  link: string | readonly string[];
}

/**
 * The top of a page: an optional link back, the page's one `<h1>`, a subtitle, and the page's
 * actions (projected content, aligned to the end).
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, AppIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly back = input<BackLink>();
}
