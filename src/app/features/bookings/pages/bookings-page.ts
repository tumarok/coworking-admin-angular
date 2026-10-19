import { SelectionModel } from '@angular/cdk/collections';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipRemove, MatChipSet } from '@angular/material/chips';
import { Router, RouterLink } from '@angular/router';
import { Notifier } from '@core/notifications/notifier';
import {
  type Booking,
  type BulkBookingAction,
  type BulkBookingResult,
  memberFullName,
} from '@shared/api/contract';
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
import { timeSpan } from '@shared/util/time-span';
import { map } from 'rxjs';
import {
  bookingLabel,
  DELETED_MEMBER,
  DELETED_ROOM,
  hasLocation,
  hasMember,
  hasRoom,
  UNKNOWN_LOCATION,
} from '../booking-display';
import { BULK_DONE, countBookings, STATUS_OPTIONS } from '../booking-options';
import { injectBulkBookings } from '../data/booking-mutations';
import { injectBookingsQuery } from '../data/booking-queries';
import { injectLocationsQuery } from '../data/location-queries';
import { injectMemberById } from '../data/member-lookups';
import { injectRoomById } from '../data/room-lookups';
import { injectBookingFormDialog } from '../dialogs/open-booking-form';
import { injectBulkResultDialog } from '../dialogs/open-bulk-result';
import { BookingListStore } from '../store/booking-list-store';
import { BulkActionsBar } from './bulk-actions-bar';

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
 *
 * The rows can be ticked, and the bar above the table then confirms or cancels them in one request.
 * The selection belongs to the page and is of the rows on screen: it is cleared when the list
 * changes (a filter, a search, a page), loses a row that a reload took away, and is cleared once
 * the action has gone through. When some bookings could not make the move, a dialog says which, and
 * why; a request that fails as a whole keeps the selection for another try.
 */
@Component({
  selector: 'app-bookings-page',
  imports: [
    AppIcon,
    BulkActionsBar,
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
  private readonly openBulkResult = injectBulkResultDialog();
  private readonly notifier = inject(Notifier);
  private readonly toolbar = viewChild.required(ListToolbar);

  protected readonly bookings = injectBookingsQuery(() => this.store.params());
  private readonly bulk = injectBulkBookings();
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

  protected readonly selection = new SelectionModel<Booking>(
    true,
    [],
    true,
    (a, b) => a.id === b.id,
  );
  protected readonly selectedCount = toSignal(
    this.selection.changed.pipe(map(() => this.selection.selected.length)),
    { initialValue: 0 },
  );
  /** The action whose request is under way. */
  protected readonly bulkRunning = signal<BulkBookingAction | undefined>(undefined);
  protected readonly rowLabel = (b: Booking) => bookingLabel(b, this.timeZones().get(b.locationId));

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

  constructor() {
    // Another list is another selection: nothing ticked on the last page, filter or search stays.
    effect(() => {
      this.store.params();
      untracked(() => {
        this.selection.clear();
      });
    });
    // A reload of the same list can take a booking away (another user cancelled and filtered it
    // out, deleted it); a row that is not on screen must not be acted on.
    effect(() => {
      const rows = this.rows();
      if (!rows) return;
      untracked(() => {
        const present = new Set(rows.map((r) => r.id));
        const gone = this.selection.selected.filter((b) => !present.has(b.id));
        if (gone.length > 0) this.selection.deselect(...gone);
      });
    });
  }

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

  /**
   * Sends the action for the selected bookings. What names each booking is read first: after the
   * answer the list reloads, and a booking may no longer be on it. The selection goes (and focus
   * to the first control of the toolbar, so it is not lost with the bar) once the request has been
   * answered, unless the list changed meanwhile (then the selection is already another's); a
   * request that fails keeps it, and the error interceptor has told the person why.
   */
  protected async runBulk(action: BulkBookingAction): Promise<void> {
    // The bar's buttons are disabled only after it has rendered, so a quick second click gets here.
    if (this.bulkRunning() || this.selection.isEmpty()) return;
    const selected = this.selection.selected;
    const listAtSend = this.store.params();
    const labels = new Map(selected.map((b) => [b.id, this.rowLabel(b)]));

    this.bulkRunning.set(action);
    let result: BulkBookingResult;
    try {
      result = await this.bulk.run({ ids: selected.map((b) => b.id), action });
    } catch {
      return;
    } finally {
      this.bulkRunning.set(undefined);
    }

    // Another list, with its own selection and its own focus, may be on screen by now: leave it be.
    if (this.store.params() === listAtSend) {
      this.selection.deselect(...selected);
      this.toolbar().focusFirst();
    }
    if (result.updated.length > 0) {
      void this.notifier.success(`${countBookings(result.updated.length)} ${BULK_DONE[action]}`);
    }
    if (result.failed.length > 0) {
      await this.openBulkResult({
        action,
        failures: result.failed.map(({ id, reason }) => ({
          id,
          label: labels.get(id) ?? id,
          reason,
        })),
      });
    }
  }
}
