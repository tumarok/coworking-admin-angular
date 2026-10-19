import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import {
  type Member,
  memberSchema,
  type MemberPlan,
  type MemberStatus,
  type Page,
  pageOf,
} from '@shared/api/contract';

/** What the members list asks the API for; the list store's `params()` has exactly this shape. */
export interface MemberListParams {
  /** 1-based. */
  page: number;
  limit: number;
  q: string;
  plan?: MemberPlan;
  status?: MemberStatus;
}

/** One page of members. Follows `params`, so a new page, search or filter is a new request. */
export function injectMembersQuery(params: () => MemberListParams): QueryRef<Page<Member>> {
  return createQuery({
    request: () => {
      const { page, limit, q, plan, status } = params();
      return { url: '/members', params: { page, limit, q, plan, status } };
    },
    tags: () => [listTag('Member')],
    parse: parseResponse(pageOf(memberSchema), 'GET /members'),
  });
}

/** One member by id. */
export function injectMemberQuery(id: () => string): QueryRef<Member> {
  return createQuery({
    request: () => ({ url: `/members/${encodeURIComponent(id())}` }),
    tags: () => [idTag('Member', id())],
    parse: parseResponse(memberSchema, 'GET /members/:id'),
  });
}
