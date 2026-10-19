import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { Router, RouterLink } from '@angular/router';
import { Notifier } from '@core/notifications/notifier';
import type { Room } from '@shared/api/contract';
import { ConfirmDialog } from '@shared/ui/confirm-dialog';
import { type DetailsField, DetailsList } from '@shared/ui/details-list';
import { DetailsValue } from '@shared/ui/details-value';
import { EmptyState } from '@shared/ui/empty-state';
import { type BackLink, PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { formatMoney, humanize } from '@shared/util/format';
import { injectDeleteRoom } from '../data/room-mutations';
import { injectRoomQuery } from '../data/room-queries';
import { injectRoomFormDialog } from '../dialogs/open-room-form';
import { DELETED_LOCATION, hasLocation } from '../room-location';

/**
 * `/rooms/:id`: one room, with Edit and Delete. A room that does not exist and a load that failed
 * are told apart: the first is final, the second can be tried again.
 *
 * The room's bookings are not listed here: a feature does not import another feature.
 */
@Component({
  selector: 'app-room-details-page',
  imports: [
    DetailsList,
    DetailsValue,
    EmptyState,
    MatButton,
    MatChip,
    MatChipSet,
    PageHeader,
    RouterLink,
    StatusChip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './room-details-page.html',
  styleUrl: './room-details-page.scss',
})
export class RoomDetailsPage {
  /** From the route: `/rooms/:id`. */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialog);
  private readonly notifier = inject(Notifier);
  private readonly openForm = injectRoomFormDialog();
  private readonly deletion = injectDeleteRoom();

  protected readonly query = injectRoomQuery(() => this.id());
  protected readonly deleting = this.deletion.isPending;
  protected readonly notFound = computed(() => this.query.error()?.status === 404);

  protected readonly back: BackLink = { label: 'Rooms', link: '/rooms' };
  protected readonly deletedLocation = DELETED_LOCATION;
  protected readonly hasLocation = hasLocation;
  protected readonly fields: readonly DetailsField<Room>[] = [
    { key: 'status', label: 'Status' },
    { key: 'type', label: 'Type', value: (r) => humanize(r.type) },
    { key: 'location', label: 'Location' },
    {
      key: 'capacity',
      label: 'Capacity',
      value: (r) => `${r.capacity} ${r.capacity === 1 ? 'seat' : 'seats'}`,
    },
    { key: 'rate', label: 'Rate', value: (r) => `${formatMoney(r.hourlyRate)} / hour` },
    { key: 'amenities', label: 'Amenities' },
  ];

  protected subtitle(room: Room): string {
    const type = humanize(room.type);
    return hasLocation(room) ? `${type} at ${room.locationName}` : type;
  }

  protected labelOf(amenity: string): string {
    return humanize(amenity);
  }

  protected async edit(room: Room): Promise<void> {
    await this.openForm(room);
  }

  protected async remove(room: Room): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: `Delete ${room.name}?`,
      message: 'The room will be removed for good. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await this.deletion.run(room.id);
    } catch {
      // The error interceptor has told the person why (a room with upcoming bookings answers
      // 409), and they stay on the page.
      return;
    }
    void this.notifier.success(`Room deleted: ${room.name}`);
    await this.router.navigate(['/rooms'], { replaceUrl: true });
  }
}
