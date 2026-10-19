import { createMutation, type MutationRef } from '@core/api/create-mutation';
import { parseResponse } from '@core/api/parse-response';
import { removedTags, savedTags } from '@core/api/tags';
import { type Location, type LocationInput, locationSchema } from '@shared/api/contract';

export interface UpdateLocationArg {
  id: string;
  input: LocationInput;
}

/**
 * Creates a location. The form shows a refusal itself, so no snackbar (`silent`). The lists reload,
 * and so does everything that shows a location's data (see `savedTags`).
 */
export function injectCreateLocation(): MutationRef<LocationInput, Location> {
  return createMutation({
    request: (input) => ({ method: 'POST', url: '/locations', body: input, silent: true }),
    parse: parseResponse(locationSchema, 'POST /locations'),
    invalidates: () => savedTags('Location'),
  });
}

/** Replaces a location (the API has no partial update). Silent like the create: the form reports. */
export function injectUpdateLocation(): MutationRef<UpdateLocationArg, Location> {
  return createMutation({
    request: ({ id, input }) => ({
      method: 'PATCH',
      url: `/locations/${id}`,
      body: input,
      silent: true,
    }),
    parse: parseResponse(locationSchema, 'PATCH /locations/:id'),
    invalidates: (_arg, saved) => savedTags('Location', saved.id),
  });
}

/**
 * Deletes a location. Not silent: a 409 (it still has rooms) reaches the person as a snackbar with
 * the server's reason, and they stay where they are. The location's own detail is not invalidated,
 * as reloading it would answer 404 while its page is still open (see `removedTags`).
 */
export function injectDeleteLocation(): MutationRef<string, void> {
  return createMutation({
    request: (id) => ({ method: 'DELETE', url: `/locations/${id}` }),
    invalidates: () => removedTags('Location'),
  });
}
