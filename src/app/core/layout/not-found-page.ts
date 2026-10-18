import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { EmptyState } from '@shared/ui/empty-state';

/** The page for any address no route knows. */
@Component({
  selector: 'app-not-found-page',
  imports: [EmptyState, MatButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-empty-state
      title="Page not found"
      message="The page you are looking for does not exist or has been moved."
      icon="error"
      [headingLevel]="1"
    >
      <a mat-flat-button routerLink="/">Back to the dashboard</a>
    </app-empty-state>
  `,
})
export class NotFoundPage {}
