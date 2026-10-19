import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Notifier } from '@core/notifications/notifier';
import type { Location } from '@shared/api/contract';
import { type DetailsField, DetailsList } from '@shared/ui/details-list';
import { DetailsValue } from '@shared/ui/details-value';
import { ConfirmDialog } from '@shared/ui/confirm-dialog';
import { EmptyState } from '@shared/ui/empty-state';
import { type BackLink, PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { injectDeleteLocation } from '../data/location-mutations';
import { injectLocationQuery } from '../data/location-queries';
import { injectLocationFormDialog } from '../dialogs/open-location-form';

/**
 * `/locations/:id`: one location, with Edit and Delete. A location that does not exist and a load
 * that failed are told apart: the first is final, the second can be tried again.
 *
 * The location's rooms are not listed here: a feature does not import another feature. The page
 * shows their count and links to the rooms list filtered to this location.
 */
@Component({
  selector: 'app-location-details-page',
  imports: [DetailsList, DetailsValue, EmptyState, MatButton, PageHeader, RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './location-details-page.html',
  styleUrl: './location-details-page.scss',
})
export class LocationDetailsPage {
  /** From the route: `/locations/:id`. */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialog);
  private readonly notifier = inject(Notifier);
  private readonly openForm = injectLocationFormDialog();
  private readonly deletion = injectDeleteLocation();

  protected readonly query = injectLocationQuery(() => this.id());
  protected readonly deleting = this.deletion.isPending;
  protected readonly notFound = computed(() => this.query.error()?.status === 404);

  protected readonly back: BackLink = { label: 'Locations', link: '/locations' };
  protected readonly fields: readonly DetailsField<Location>[] = [
    { key: 'status', label: 'Status' },
    { key: 'city', label: 'City', value: (l) => l.city },
    { key: 'address', label: 'Address', value: (l) => l.address },
    { key: 'timezone', label: 'Time zone', value: (l) => l.timezone },
    { key: 'hours', label: 'Opening hours', value: (l) => `${l.opensAt}–${l.closesAt}` },
    { key: 'rooms', label: 'Rooms' },
  ];

  protected async edit(location: Location): Promise<void> {
    await this.openForm(location);
  }

  protected async remove(location: Location): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: `Delete ${location.name}?`,
      message: 'The location will be removed for good. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await this.deletion.run(location.id);
    } catch {
      // The error interceptor has told the person why (a location with rooms answers 409), and
      // they stay on the page.
      return;
    }
    void this.notifier.success(`Location deleted: ${location.name}`);
    await this.router.navigate(['/locations'], { replaceUrl: true });
  }
}
