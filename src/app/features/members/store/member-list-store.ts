import { signalStore } from '@ngrx/signals';
import { MEMBER_PLANS, MEMBER_STATUSES } from '@shared/api/contract';
import { enumFilter } from '@shared/util/list-params';
import { withListParams } from '@shared/util/with-list-params';

/**
 * The state of the members list: page, page size, search, plan and status, all in the URL. Provide
 * it on the page (`providers: [MemberListStore]`), not in root, so it reads the page's own route.
 */
export const MemberListStore = signalStore(
  withListParams({
    filters: { plan: enumFilter(MEMBER_PLANS), status: enumFilter(MEMBER_STATUSES) },
  }),
);
