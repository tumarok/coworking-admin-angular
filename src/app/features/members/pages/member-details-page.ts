import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { Notifier } from '@core/notifications/notifier';
import { type Member, memberFullName } from '@shared/api/contract';
import { ConfirmDialog } from '@shared/ui/confirm-dialog';
import { type DetailsField, DetailsList } from '@shared/ui/details-list';
import { DetailsValue } from '@shared/ui/details-value';
import { EmptyState } from '@shared/ui/empty-state';
import { type BackLink, PageHeader } from '@shared/ui/page-header';
import { StatusChip } from '@shared/ui/status-chip';
import { formatDate, humanize } from '@shared/util/format';
import { injectDeleteMember } from '../data/member-mutations';
import { injectMemberQuery } from '../data/member-queries';
import { injectMemberFormDialog } from '../dialogs/open-member-form';

/**
 * `/members/:id`: one member, with Edit and Delete. A member that does not exist and a load that
 * failed are told apart: the first is final, the second can be tried again.
 *
 * The member's bookings are not listed here: a feature does not import another feature. The page
 * links to the bookings list filtered to this member.
 */
@Component({
  selector: 'app-member-details-page',
  imports: [DetailsList, DetailsValue, EmptyState, MatButton, PageHeader, RouterLink, StatusChip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './member-details-page.html',
  styleUrl: './member-details-page.scss',
})
export class MemberDetailsPage {
  /** From the route: `/members/:id`. */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialog);
  private readonly notifier = inject(Notifier);
  private readonly openForm = injectMemberFormDialog();
  private readonly deletion = injectDeleteMember();

  protected readonly query = injectMemberQuery(() => this.id());
  protected readonly deleting = this.deletion.isPending;
  protected readonly notFound = computed(() => this.query.error()?.status === 404);

  protected readonly back: BackLink = { label: 'Members', link: '/members' };
  protected readonly fullName = memberFullName;
  protected readonly fields: readonly DetailsField<Member>[] = [
    { key: 'status', label: 'Status' },
    { key: 'plan', label: 'Plan', value: (m) => humanize(m.plan) },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', value: (m) => m.phone },
    { key: 'company', label: 'Company', value: (m) => m.company },
    { key: 'joined', label: 'Member since', value: (m) => formatDate(m.joinedAt) },
    { key: 'bookings', label: 'Bookings' },
  ];

  protected async edit(member: Member): Promise<void> {
    await this.openForm(member);
  }

  protected async remove(member: Member): Promise<void> {
    const name = memberFullName(member);
    const confirmed = await this.confirmDialog.confirm({
      title: `Delete ${name}?`,
      message: 'The member will be removed for good. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await this.deletion.run(member.id);
    } catch {
      // The error interceptor has told the person why (a member with upcoming bookings answers
      // 409), and they stay on the page.
      return;
    }
    void this.notifier.success(`Member removed: ${name}`);
    await this.router.navigate(['/members'], { replaceUrl: true });
  }
}
