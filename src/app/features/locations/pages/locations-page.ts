import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import type { Location } from '@shared/api/contract';
import { AppIcon } from '@shared/ui/app-icon';
import { DataTable, type DataTableColumn } from '@shared/ui/data-table';
import { DataTableCell } from '@shared/ui/data-table-cell';
import { FilterSelect } from '@shared/ui/filter-select';
import { ListToolbar } from '@shared/ui/list-toolbar';
import { PageHeader } from '@shared/ui/page-header';
import { SearchInput } from '@shared/ui/search-input';
import { StatusChip } from '@shared/ui/status-chip';
import { injectLocationsQuery } from '../data/location-queries';
import { injectLocationFormDialog } from '../dialogs/open-location-form';
import { STATUS_OPTIONS } from '../location-options';
import { LocationListStore } from '../store/location-list-store';

/**
 * `/locations`: the network's locations, searchable and filterable, a page at a time. The list's
 * state lives in the URL (see `LocationListStore`), the data comes from a query that follows it,
 * and "New location" opens the form and goes to the new location's page.
 */
@Component({
  selector: 'app-locations-page',
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
  providers: [LocationListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './locations-page.html',
})
export class LocationsPage {
  protected readonly store = inject(LocationListStore);
  private readonly router = inject(Router);
  private readonly openForm = injectLocationFormDialog();

  protected readonly locations = injectLocationsQuery(() => this.store.params());
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly emptyMessage = computed(() =>
    this.store.hasActiveFilters() ? 'Nothing matches the current filters.' : 'No locations yet.',
  );

  protected readonly columns: readonly DataTableColumn<Location>[] = [
    { key: 'name', header: 'Name', value: (l) => l.name, link: (l) => ['/locations', l.id] },
    { key: 'city', header: 'City', value: (l) => l.city },
    { key: 'address', header: 'Address', value: (l) => l.address },
    { key: 'hours', header: 'Hours', value: (l) => `${l.opensAt}–${l.closesAt}`, nowrap: true },
    { key: 'rooms', header: 'Rooms', value: (l) => String(l.roomCount) },
    { key: 'status', header: 'Status' },
  ];

  protected async create(): Promise<void> {
    const created = await this.openForm();
    if (created) await this.router.navigate(['/locations', created.id]);
  }
}
