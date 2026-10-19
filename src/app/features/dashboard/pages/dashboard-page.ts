import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatProgressBar } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { BOOKING_STATUSES, type Dashboard } from '@shared/api/contract';
import { DateField } from '@shared/forms/date-field';
import { AppIcon } from '@shared/ui/app-icon';
import { EmptyState } from '@shared/ui/empty-state';
import type { IconName } from '@shared/ui/icon-paths';
import { PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { formatDate, formatMoney, formatMonth } from '@shared/util/format';
import { timeSpan } from '@shared/util/time-span';
import { injectDashboardQuery } from '../data/dashboard-queries';
import { DashboardStore } from '../store/dashboard-store';

interface Kpi {
  label: string;
  /** The tint of the icon's square. */
  tone: 'primary' | 'secondary' | 'tertiary' | 'neutral';
  value: string;
  icon: IconName;
}

interface LocationOccupancy {
  locationId: string;
  name: string;
  /** "7.5 of 48 h". */
  hours: string;
  /** 0 to 100. */
  percent: number;
}

interface StatusCount {
  status: (typeof BOOKING_STATUSES)[number];
  count: number;
  /** The bar's length, 0 to 100: the biggest count fills it. */
  percent: number;
}

/** Hours to one decimal, without a trailing zero: `7.5`, `48`. */
const hours = (value: number): string => String(Math.round(value * 10) / 10);

/** The revenue is of the month the day falls in, so the label names it. */
const kpisOf = ({ date, kpis }: Dashboard): Kpi[] => [
  { label: 'Bookings', value: String(kpis.bookingsToday), icon: 'event', tone: 'primary' },
  {
    label: 'Occupancy',
    value: `${Math.round(kpis.occupancyRate * 100)}%`,
    icon: 'meeting_room',
    tone: 'secondary',
  },
  {
    label: `Revenue in ${formatMonth(`${date}T00:00:00.000Z`)}`,
    value: formatMoney(kpis.revenueMonth),
    icon: 'payments',
    tone: 'tertiary',
  },
  { label: 'Active members', value: String(kpis.activeMembers), icon: 'group', tone: 'neutral' },
];

const occupancyOf = ({ occupancy }: Dashboard): LocationOccupancy[] =>
  occupancy.map((o) => ({
    locationId: o.locationId,
    name: o.locationName,
    hours: `${hours(o.bookedHours)} of ${hours(o.availableHours)} h`,
    percent: o.availableHours > 0 ? Math.round((o.bookedHours / o.availableHours) * 100) : 0,
  }));

/** Every status, in the order of `BOOKING_STATUSES`, with a bar scaled to the biggest count. */
const statusesOf = ({ byStatus }: Dashboard): StatusCount[] => {
  const counts = BOOKING_STATUSES.map((status) => ({ status, count: byStatus[status] }));
  const biggest = Math.max(1, ...counts.map((c) => c.count));
  return counts.map((c) => ({ ...c, percent: (c.count / biggest) * 100 }));
};

/**
 * `/`: how the day went across all locations: key figures, occupancy by location, bookings by
 * status, and the next bookings. The day is in the URL (see `DashboardStore`) and the data comes
 * from a query that follows it. The next bookings do not depend on the day.
 *
 * While another day loads, the figures of the last one stay on screen (the query keeps the last
 * result of an endpoint while its params change), marked busy and with a progress bar above them,
 * instead of giving way to a blank page.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    AppIcon,
    DateField,
    EmptyState,
    MatButton,
    MatProgressBar,
    PageHeader,
    RouterLink,
    StatusChip,
  ],
  providers: [DashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly store = inject(DashboardStore);

  protected readonly query = injectDashboardQuery(() => this.store.date());
  /**
   * The failure of this day's load, when there are no figures of this day to show: the ones left
   * from another day would be taken for these.
   */
  protected readonly failed = computed(
    () => this.query.error() && this.query.value()?.date !== this.store.date(),
  );

  /** What the date box holds: what is typed, until the address takes over. */
  protected readonly entry = linkedSignal(() => this.store.date());
  private cleared = false;

  protected readonly subtitle = computed(
    () => `Across all locations on ${formatDate(`${this.store.date()}T00:00:00.000Z`)}`,
  );

  /** What the page draws from the figures that are there; none while the first load runs. */
  protected readonly view = computed(() => {
    const dashboard = this.query.value();
    return (
      dashboard && {
        kpis: kpisOf(dashboard),
        occupancy: occupancyOf(dashboard),
        statuses: statusesOf(dashboard),
        upcoming: dashboard.upcoming,
      }
    );
  });

  /** The next bookings carry no time zone, so their times read in UTC and say so. */
  protected readonly timeSpan = timeSpan;

  /** A day typed or picked is shown at once; text that is not a day waits for the box to be left. */
  protected pick(day: string): void {
    this.entry.set(day);
    this.cleared = day === '';
    if (day) void this.show(day);
  }

  /**
   * An emptied (or unreadable) box means today. It is acted on when the person leaves the box,
   * not as they type: a day being typed over reads as no day until its year is complete, and
   * showing today in the middle of that would take the text out from under the cursor.
   */
  protected async leave(): Promise<void> {
    if (!this.cleared) return;
    this.cleared = false;
    await this.show('');
    this.entry.set(this.store.date());
  }

  /** Puts the day into the address. A navigation that fails leaves the address, and so the box, as it was. */
  private async show(day: string): Promise<void> {
    try {
      await this.store.setDate(day);
    } catch {
      this.entry.set(this.store.date());
    }
  }
}
