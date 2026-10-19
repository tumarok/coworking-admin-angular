import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import type { Room } from '@shared/api/contract';
import { AppIcon } from '@shared/ui/app-icon';
import { DataTable, type DataTableColumn } from '@shared/ui/data-table';
import { DataTableCell } from '@shared/ui/data-table-cell';
import { FilterSelect } from '@shared/ui/filter-select';
import { ListToolbar } from '@shared/ui/list-toolbar';
import { PageHeader } from '@shared/ui/page-header';
import { SearchInput } from '@shared/ui/search-input';
import type { SelectOption } from '@shared/ui/select-option';
import { StatusChip } from '@shared/ui/status-chip';
import { formatMoney, humanize } from '@shared/util/format';
import { injectLocationOptions } from '../data/location-options';
import { injectRoomsQuery } from '../data/room-queries';
import { injectRoomFormDialog } from '../dialogs/open-room-form';
import { DELETED_LOCATION, hasLocation } from '../room-location';
import { STATUS_OPTIONS, TYPE_OPTIONS } from '../room-options';
import { RoomListStore } from '../store/room-list-store';

/** The label of a location filter that names a location the API does not list. */
const UNKNOWN_LOCATION = 'Unknown location';

/**
 * `/rooms`: the network's rooms, searchable and filterable by location, type and status, a page at
 * a time. The list's state lives in the URL (see `RoomListStore`), the data comes from a query that
 * follows it, and "New room" opens the form and goes to the new room's page.
 */
@Component({
  selector: 'app-rooms-page',
  imports: [
    AppIcon,
    DataTable,
    DataTableCell,
    FilterSelect,
    ListToolbar,
    MatButton,
    PageHeader,
    SearchInput,
    StatusChip,
  ],
  providers: [RoomListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rooms-page.html',
})
export class RoomsPage {
  protected readonly store = inject(RoomListStore);
  private readonly router = inject(Router);
  private readonly openForm = injectRoomFormDialog();

  protected readonly rooms = injectRoomsQuery(() => this.store.params());
  private readonly locations = injectLocationOptions();
  /**
   * The locations, plus the one a link or an old URL names when it is not among them (it was
   * deleted), so the filter in force is on screen and can be taken off.
   */
  protected readonly locationOptions = computed<readonly SelectOption[]>(() => {
    const options = this.locations.options();
    const id = this.store.params().locationId;
    const unknown = id && this.locations.loaded() && !options.some((o) => o.value === id);
    return unknown ? [{ value: id, label: UNKNOWN_LOCATION }, ...options] : options;
  });
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly emptyMessage = computed(() =>
    this.store.hasActiveFilters() ? 'No rooms match the current filters.' : 'No rooms yet.',
  );

  protected readonly columns: readonly DataTableColumn<Room>[] = [
    { key: 'name', header: 'Name', value: (r) => r.name, link: (r) => ['/rooms', r.id] },
    {
      key: 'location',
      header: 'Location',
      value: (r) => (hasLocation(r) ? r.locationName : DELETED_LOCATION),
      link: (r) => (hasLocation(r) ? ['/locations', r.locationId] : undefined),
    },
    { key: 'type', header: 'Type', value: (r) => humanize(r.type) },
    { key: 'seats', header: 'Seats', value: (r) => String(r.capacity) },
    { key: 'rate', header: 'Rate / hour', value: (r) => formatMoney(r.hourlyRate), nowrap: true },
    { key: 'status', header: 'Status' },
  ];

  protected async create(): Promise<void> {
    const created = await this.openForm();
    if (created) await this.router.navigate(['/rooms', created.id]);
  }
}
