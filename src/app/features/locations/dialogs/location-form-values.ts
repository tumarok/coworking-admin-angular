import type { Location, LocationInput } from '@shared/api/contract';

/** What the form edits: the fields of the API's input, so the form and the API cannot disagree. */
export type LocationFormValues = LocationInput;

/** A new location starts with business hours and the network's home time zone. */
const NEW_LOCATION: LocationFormValues = {
  name: '',
  city: '',
  address: '',
  timezone: 'Europe/Kyiv',
  opensAt: '08:00',
  closesAt: '20:00',
  status: 'active',
};

/** The values to start the form from: the location being edited, or the defaults for a new one. */
export function toLocationFormValues(location?: Location): LocationFormValues {
  if (!location) return { ...NEW_LOCATION };
  const { name, city, address, timezone, opensAt, closesAt, status } = location;
  return { name, city, address, timezone, opensAt, closesAt, status };
}
