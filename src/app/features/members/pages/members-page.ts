import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { type Member, memberFullName } from '@shared/api/contract';
import { AppIcon } from '@shared/ui/app-icon';
import { DataTable, type DataTableColumn } from '@shared/ui/data-table';
import { DataTableCell } from '@shared/ui/data-table-cell';
import { FilterSelect } from '@shared/ui/filter-select';
import { ListToolbar } from '@shared/ui/list-toolbar';
import { PageHeader } from '@shared/ui/page-header';
import { SearchInput } from '@shared/ui/search-input';
import { StatusChip } from '@shared/ui/status-chip';
import { formatDate, humanize, PLACEHOLDER } from '@shared/util/format';
import { injectMembersQuery } from '../data/member-queries';
import { injectMemberFormDialog } from '../dialogs/open-member-form';
import { PLAN_OPTIONS, STATUS_OPTIONS } from '../member-options';
import { MemberListStore } from '../store/member-list-store';

/**
 * `/members`: the people and teams with a plan, searchable and filterable by plan and status, a
 * page at a time. The list's state lives in the URL (see `MemberListStore`), the data comes from a
 * query that follows it, and "New member" opens the form and goes to the new member's page.
 */
@Component({
  selector: 'app-members-page',
  imports: [
    AppIcon,
    DataTable,
    DataTableCell,
    FilterSelect,
    ListToolbar,
    MatButton,
    PageHeader,
    SearchInput,
    StatusChip,
  ],
  providers: [MemberListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './members-page.html',
})
export class MembersPage {
  protected readonly store = inject(MemberListStore);
  private readonly router = inject(Router);
  private readonly openForm = injectMemberFormDialog();

  protected readonly members = injectMembersQuery(() => this.store.params());
  protected readonly planOptions = PLAN_OPTIONS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly emptyMessage = computed(() =>
    this.store.hasActiveFilters() ? 'Nothing matches the current filters.' : 'No members yet.',
  );

  protected readonly columns: readonly DataTableColumn<Member>[] = [
    { key: 'name', header: 'Name', value: memberFullName, link: (m) => ['/members', m.id] },
    { key: 'email', header: 'Email', value: (m) => m.email },
    { key: 'company', header: 'Company', value: (m) => m.company ?? PLACEHOLDER },
    { key: 'plan', header: 'Plan', value: (m) => humanize(m.plan) },
    { key: 'joined', header: 'Member since', value: (m) => formatDate(m.joinedAt), nowrap: true },
    { key: 'status', header: 'Status' },
  ];

  protected async create(): Promise<void> {
    const created = await this.openForm();
    if (created) await this.router.navigate(['/members', created.id]);
  }
}
