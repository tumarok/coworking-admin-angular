import type { IconName } from '@shared/ui/icon-paths';

export interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  /** Active only on exactly this path; the others are active on their sub-pages too. */
  exact?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/', icon: 'dashboard', exact: true },
  { label: 'Locations', path: '/locations', icon: 'domain' },
  { label: 'Rooms', path: '/rooms', icon: 'meeting_room' },
  { label: 'Members', path: '/members', icon: 'group' },
  { label: 'Bookings', path: '/bookings', icon: 'event' },
];
