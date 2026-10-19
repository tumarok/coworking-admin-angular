import { type Member, memberInputSchema } from '@shared/api/contract';
import { z } from 'zod';

/**
 * The member form's schema: the contract's own input schema where the form and the API agree, and
 * two differences that belong to the form.
 *
 * - The email is trimmed first, as a pasted address often carries a space.
 * - The company is a text field, so empty is `''` while typing; it is sent as `null`, which is what
 *   the API stores for no company.
 *
 * `memberFormSchema.parse(values)` is therefore the `MemberInput` to send.
 */
export const memberFormSchema = memberInputSchema.extend({
  email: z.string().trim().pipe(memberInputSchema.shape.email),
  company: z
    .string()
    .trim()
    .transform((company) => company || null)
    .pipe(memberInputSchema.shape.company),
});

/** What the form edits. The company is text, never `null`. */
export type MemberFormValues = z.input<typeof memberFormSchema>;

/** A new member is on the flex plan and active, the usual start. */
const NEW_MEMBER: MemberFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  plan: 'flex',
  status: 'active',
};

/** The values to start the form from: the member being edited, or the defaults for a new one. */
export function toMemberFormValues(member?: Member): MemberFormValues {
  if (!member) return { ...NEW_MEMBER };
  const { firstName, lastName, email, phone, company, plan, status } = member;
  return { firstName, lastName, email, phone, company: company ?? '', plan, status };
}
