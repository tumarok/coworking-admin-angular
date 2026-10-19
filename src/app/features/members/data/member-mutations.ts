import { createMutation, type MutationRef } from '@core/api/create-mutation';
import { parseResponse } from '@core/api/parse-response';
import { removedTags, savedTags } from '@core/api/tags';
import { type Member, type MemberInput, memberSchema } from '@shared/api/contract';

export interface UpdateMemberArg {
  id: string;
  input: MemberInput;
}

/**
 * Creates a member. The form shows a refusal itself (a taken email is a 422 under the field), so no
 * snackbar (`silent`). The lists reload, and so does everything that shows a member's data (see
 * `savedTags`).
 */
export function injectCreateMember(): MutationRef<MemberInput, Member> {
  return createMutation({
    request: (input) => ({ method: 'POST', url: '/members', body: input, silent: true }),
    parse: parseResponse(memberSchema, 'POST /members'),
    invalidates: () => savedTags('Member'),
  });
}

/**
 * Updates a member with its whole input: a PATCH, though the API takes no partial update. Silent
 * like the create: the form reports.
 */
export function injectUpdateMember(): MutationRef<UpdateMemberArg, Member> {
  return createMutation({
    request: ({ id, input }) => ({
      method: 'PATCH',
      url: `/members/${id}`,
      body: input,
      silent: true,
    }),
    parse: parseResponse(memberSchema, 'PATCH /members/:id'),
    invalidates: (_arg, saved) => savedTags('Member', saved.id),
  });
}

/**
 * Deletes a member. Not silent: a 409 (the member still has upcoming bookings) reaches the person
 * as a snackbar with the server's reason, and they stay where they are. The member's own detail is
 * not invalidated, as reloading it would answer 404 while its page is still open (see
 * `removedTags`).
 */
export function injectDeleteMember(): MutationRef<string, void> {
  return createMutation({
    request: (id) => ({ method: 'DELETE', url: `/members/${id}` }),
    invalidates: () => removedTags('Member'),
  });
}
