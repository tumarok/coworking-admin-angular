import {
  MEMBER_PLANS,
  MEMBER_STATUSES,
  type MemberPlan,
  type MemberStatus,
} from '@shared/api/contract';
import type { SelectOption } from '@shared/ui/select-option';
import { humanize } from '@shared/util/format';

const optionsOf = <V extends string>(values: readonly V[]): readonly SelectOption<V>[] =>
  values.map((value) => ({ value, label: humanize(value) }));

/** The filters and the form's fields offer the same choices. */
export const PLAN_OPTIONS: readonly SelectOption<MemberPlan>[] = optionsOf(MEMBER_PLANS);
export const STATUS_OPTIONS: readonly SelectOption<MemberStatus>[] = optionsOf(MEMBER_STATUSES);
