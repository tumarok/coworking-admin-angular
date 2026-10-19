import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipRemove, MatChipSet } from '@angular/material/chips';
import { Router, RouterLink } from '@angular/router';
import { type Booking, memberFullName } from '@shared/api/contract';
import { DateField } from '@shared/forms/date-field';
import { AppIcon } from '@shared/ui/app-icon';
import { DataTable, type DataTableColumn } from '@shared/ui/data-table';
import { DataTableCell } from '@shared/ui/data-table-cell';
import { FilterSelect } from '@shared/ui/filter-select';
import { ListToolbar } from '@shared/ui/list-toolbar';
import { PageHeader } from '@shared/ui/page-header';
import { SearchInput } from '@shared/ui/search-input';
import { withCurrentOption } from '@shared/ui/select-option';
import { StatusChip } from '@shared/ui/status-chip';
import { formatMoney } from '@shared/util/format';
import {
  DELETED_MEMBER,
  DELETED_ROOM,
  hasLocation,
  hasMember,
  hasRoom,
  timeSpan,
  UNKNOWN_LOCATION,
} from '../booking-display';
import { STATUS_OPTIONS } from '../booking-options';
import { injectBookingsQuery } from '../data/booking-queries';
import { injectLocationsQuery } from '../data/location-queries';
import { injectMemberById } from '../data/member-lookups';
import { injectRoomById } from '../data/room-lookups';
import { injectBookingFormDialog } from '../dialogs/open-booking-form';
import { BookingListStore } from '../store/booking-list-store';

/** A room or a member the list is narrowed to by a link, shown so that it can be taken off. */
interface LookupChip {
  key: 'roomId' | 'memberId';
  label: string;
  /** Names the button that takes the filter off. */
  removeLabel: string;
}

const UNKNOWN_ROOM = 'Unknown room';
const UNKNOWN_MEMBER = 'Unknown member';

/**
 * `/bookings`: who uses which room, and when, a page at a time, searchable and filterable by day,
 * status and location. A link can also narrow the list to a member (`?memberId=`) or a room
 * (`?roomId=`); that filter shows as a chip until it is taken off. The list's state lives in the
 * URL (see `BookingListStore`), the data comes from a query that follows it, and "New booking"
 * opens the form and goes to the new booking's page.
 *
 * Each booking reads on the clock of its own location, which the locations' time zones tell; the
 * rows wait for them, so no time is first drawn in one zone and then in another.
 */
@Component({
  selector: 'app-bookings-page',
  imports: [
    AppIcon,
    DataTable,
    DataTableCell,
    DateField,
    FilterSelect,
    ListToolbar,
    MatButton,
    MatChip,
    MatChipRemove,
    MatChipSet,
    PageHeader,
    RouterLink,
    SearchInput,
    StatusChip,
  ],
  providers: [BookingListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bookings-page.html',
  styleUrl: './bookings-page.scss',
})
export class BookingsPage {
  protected readonly store = inject(BookingListStore);
  private readonly router = inject(Router);
  private readonly openForm = injectBookingFormDialog();
  private readonly toolbar = viewChild.required(ListToolbar);

  protected readonly bookings = injectBookingsQuery(() => this.store.params());
  private readonly locations = injectLocationsQuery();
  private readonly member = injectMemberById(() => this.store.params().memberId);
  private readonly room = injectRoomById(() => this.store.params().roomId);

  private readonly timeZones = computed(
    () => new Map(this.locations.value()?.items.map((l): [string, string] => [l.id, l.timezone])),
  );
  /** The rows are drawn once the clocks are known, or known to be out of reach. */
  protected readonly rows = computed(() =>
    this.locations.value() || this.locations.error() ? this.bookings.value()?.items : undefined,
  );

  /**
   * The locations, plus the one a link or an old URL names when it is not among them (it was
   * deleted), so the filter in force is on screen and can be taken off.
   */
  protected readonly locationOptions = computed(() =>
    withCurrentOption(
      this.locations.value()?.items.map((l) => ({ value: l.id, label: l.name })) ?? [],
      this.store.params().locationId,
      this.locations.value() !== undefined,
      UNKNOWN_LOCATION,
    ),
  );
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly emptyMessage = computed(() =>
    this.store.hasActiveFilters() ? 'No bookings match the current filters.' : 'No bookings yet.',
  );

  /** The member and the room the address narrows the list to, once their names are known. */
  protected readonly chips = computed<readonly LookupChip[]>(() => {
    const { memberId, roomId } = this.store.params();
    const chips: LookupChip[] = [];
    if (memberId) {
      const member = this.member.value();
      if (member || this.member.error()) {
        chips.push({
          key: 'memberId',
          label: member ? `Member: ${memberFullName(member)}` : UNKNOWN_MEMBER,
          removeLabel: 'Remove member filter',
        });
      }
    }
    if (roomId) {
      const room = this.room.value();
      if (room || this.room.error()) {
        chips.push({
          key: 'roomId',
          label: room ? `Room: ${room.name}` : UNKNOWN_ROOM,
          removeLabel: 'Remove room filter',
        });
      }
    }
    return chips;
  });

  protected readonly columns: readonly DataTableColumn<Booking>[] = [
    {
      key: 'when',
      header: 'When',
      value: (b) => timeSpan(b, this.timeZones().get(b.locationId)),
      link: (b) => ['/bookings', b.id],
      nowrap: true,
    },
    { key: 'room', header: 'Room' },
    {
      key: 'member',
      header: 'Member',
      value: (b) => (hasMember(b) ? b.memberName : DELETED_MEMBER),
      link: (b) => (hasMember(b) ? ['/members', b.memberId] : undefined),
    },
    { key: 'people', header: 'People', value: (b) => String(b.attendees) },
    { key: 'price', header: 'Price', value: (b) => formatMoney(b.totalPrice), nowrap: true },
    { key: 'status', header: 'Status' },
  ];

  protected readonly hasRoom = hasRoom;
  protected readonly hasLocation = hasLocation;
  protected readonly deletedRoom = DELETED_ROOM;

  /** Setting a day that contradicts the other end (from after to) takes the other end off. */
  protected setFrom(from: string): void {
    const { to } = this.store.params();
    void this.store.patch({
      from: from || undefined,
      ...(from && to && to < from ? { to: undefined } : {}),
    });
  }

  protected setTo(to: string): void {
    const { from } = this.store.params();
    void this.store.patch({
      to: to || undefined,
      ...(to && from && to < from ? { from: undefined } : {}),
    });
  }

  protected removeChip(key: LookupChip['key']): void {
    void this.store.setFilter(key, undefined);
    // The chip goes away with the click, which would leave focus nowhere.
    this.toolbar().focusFirst();
  }

  protected async create(): Promise<void> {
    const created = await this.openForm();
    if (created) await this.router.navigate(['/bookings', created.id]);
  }
}
