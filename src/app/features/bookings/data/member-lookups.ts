import { createQuery, type QueryRef } from '@core/api/create-query';
import { parseResponse } from '@core/api/parse-response';
import { idTag, listTag } from '@core/api/tags';
import { type Member, memberSchema, type Page, pageOf } from '@shared/api/contract';
import { LOOKUP_PAGE_SIZE } from './lookup-size';

/**
 * The members that match a search, for the member field of the form: the first page of those who
 * can book (`status=active`). The server does the searching, so a membership of any size works; the
 * field asks again as the text changes.
 */
export function injectMemberSearch(search: () => string): QueryRef<Page<Member>> {
  return createQuery({
    request: () => ({
      url: '/members',
      params: { page: 1, limit: LOOKUP_PAGE_SIZE, q: search(), status: 'active' },
    }),
    tags: () => [listTag('Member')],
    parse: parseResponse(pageOf(memberSchema), 'GET /members'),
  });
}

/**
 * One member by id, whatever their status: the member of a booking being edited, a prefilled member
 * and the member named by a filter in the address. Without an id (`undefined`) nothing is asked.
 */
export function injectMemberById(id: () => string | undefined): QueryRef<Member> {
  return createQuery({
    request: () => {
      const memberId = id();
      return memberId ? { url: `/members/${encodeURIComponent(memberId)}` } : undefined;
    },
    tags: () => {
      const memberId = id();
      return memberId ? [idTag('Member', memberId)] : [];
    },
    parse: parseResponse(memberSchema, 'GET /members/:id'),
  });
}
