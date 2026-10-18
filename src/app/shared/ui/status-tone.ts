/** The colour families of a status; each has its tokens in `src/styles/_tokens.scss`. */
export type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'contrast' | 'neutral';

/**
 * Which tone a status value has, across the booking, location, member and room statuses. The same
 * word means the same everywhere (`active` is always success, `cancelled` always neutral), so one
 * table serves them all. A value no one has listed yet reads as neutral instead of breaking.
 */
const TONES: Readonly<Record<string, StatusTone>> = {
  pending: 'warning',
  confirmed: 'info',
  checked_in: 'success',
  completed: 'contrast',
  cancelled: 'neutral',
  no_show: 'danger',
  active: 'success',
  inactive: 'neutral',
  suspended: 'warning',
  available: 'success',
  maintenance: 'warning',
  retired: 'neutral',
};

export function statusTone(status: string): StatusTone {
  return TONES[status] ?? 'neutral';
}
