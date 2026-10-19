import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { listTag } from '@core/api/tags';
import { type Dashboard, dashboardSchema } from '@shared/api/contract';

/**
 * The dashboard of a day (`YYYY-MM-DD`, read in UTC). Follows `date`, so another day is another
 * request. It shows figures drawn from every booking, room, location and member, so it is tagged
 * as `Dashboard`, which each of their changes invalidates (see `EMBEDDED_IN`).
 */
export function injectDashboardQuery(date: () => string): QueryRef<Dashboard> {
  return createQuery({
    request: () => ({ url: '/dashboard', params: { date: date() } }),
    tags: () => [listTag('Dashboard')],
    parse: parseResponse(dashboardSchema, 'GET /dashboard'),
  });
}
