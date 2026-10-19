import { computed, type Signal } from '@angular/core';
import { createQuery } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { listTag } from '@core/api/tags';
import type { ApiError } from '@shared/api/api-error';
import { locationSchema, MAX_PAGE_SIZE, pageOf } from '@shared/api/contract';
import type { SelectOption } from '@shared/ui/select-option';

export interface LocationOptions {
  /** The locations by name, as dropdown choices; empty until they arrive. */
  options: Signal<readonly SelectOption[]>;
  /** The locations have arrived. */
  loaded: Signal<boolean>;
  /** The reason the locations could not be loaded. */
  error: Signal<ApiError | undefined>;
}

/**
 * The locations a room can belong to, for a dropdown (the filter of the list, the field of the
 * form). A room feature may not import the locations feature, so it asks the API itself: one page
 * of the biggest size the API allows, which a dropdown can hold.
 */
export function injectLocationOptions(): LocationOptions {
  const query = createQuery({
    request: () => ({ url: '/locations', params: { page: 1, limit: MAX_PAGE_SIZE } }),
    tags: () => [listTag('Location')],
    parse: parseResponse(pageOf(locationSchema), 'GET /locations'),
  });
  return {
    options: computed(
      () =>
        query.value()?.items.map((location) => ({ value: location.id, label: location.name })) ??
        [],
    ),
    loaded: computed(() => query.value() !== undefined),
    error: query.error,
  };
}
