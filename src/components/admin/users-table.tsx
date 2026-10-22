"use client";

import { useQuery } from "convex/react";
import { Building2Icon, ShieldCheckIcon, StoreIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Identity } from "@/components/app/avatar";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  BulkBar,
  DataToolbar,
  RefreshScope,
  RowCheckbox,
  runBulk,
  SelectAllCheckbox,
  useSelection,
  useTableState,
} from "@/components/app/data-toolbar";
import {
  ActiveFilters,
  by,
  dateFacet,
  type Facet,
  FilterMenu,
  type FilterValue,
  SortMenu,
  type SortStrategy,
  type SortValue,
  sortRows,
  useFacets,
} from "@/components/app/sort-filter";
import { Status } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { authClient } from "@/lib/auth-client";
import { downloadCsv } from "@/lib/csv";
import { isStaffRole, ROLE_LABELS, STAFF_ROLES } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { CreateUserDialog } from "./create-user-dialog";
import { AdminPageHeader } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";
import { type AdminUser, UserInspector } from "./user-inspector";

type Filter = "all" | "sme" | "enterprise" | "staff" | "unassigned" | "banned";
type BulkAction = "ban" | "unban" | "signOut" | "delete";

function matches(user: AdminUser, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "sme":
    case "enterprise":
    case "staff":
      return user.accountType === filter;
    case "unassigned":
      return user.accountType === null;
    case "banned":
      return !!user.banned;
  }
}

function accountLabel(user: AdminUser) {
  if (user.accountType === "staff") return isStaffRole(user.role) ? ROLE_LABELS[user.role].label : "Staff";
  if (user.accountType === "sme") return "SME";
  if (user.accountType === "enterprise") return "Enterprise";
  return "Not set up";
}

/** What kind of account, with an icon in its logo colour. */
export function AccountPills({ user }: { user: AdminUser }) {
  const icon =
    user.accountType === "sme" ? (
      <StoreIcon className="size-3.5 text-brand-green" />
    ) : user.accountType === "enterprise" ? (
      <Building2Icon className="size-3.5 text-brand-blue" />
    ) : user.accountType === "staff" ? (
      <ShieldCheckIcon className="size-3.5 text-primary" />
    ) : null;
  if (!icon) return <Status tone="warning">Not set up</Status>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      {icon}
      {accountLabel(user)}
    </span>
  );
}

const ACCOUNT_ORDER = { staff: 0, enterprise: 1, sme: 2 } as const;
const domain = (u: AdminUser) => u.email.split("@")[1] ?? "";

const SORTS: SortStrategy<AdminUser>[] = [
  { id: "newest", label: "Newest first", group: "Joined", compare: by.number((u) => u.createdAt, true) },
  { id: "oldest", label: "Oldest first", group: "Joined", compare: by.number((u) => u.createdAt) },
  { id: "name", label: "Name, A to Z", group: "Name", compare: by.text((u) => u.name) },
  { id: "name-desc", label: "Name, Z to A", group: "Name", compare: by.text((u) => u.name, true) },
  { id: "email", label: "Email, A to Z", group: "Name", compare: by.text((u) => u.email) },
  { id: "domain", label: "Email domain", group: "Name", compare: by.text(domain) },
  {
    id: "account",
    label: "Account type",
    group: "Account",
    compare: by.number((u) => (u.accountType ? ACCOUNT_ORDER[u.accountType] : 3)),
  },
  { id: "unassigned", label: "Not set up first", group: "Needs attention", compare: by.first((u) => !u.accountType) },
  {
    id: "unverified",
    label: "Unverified email first",
    group: "Needs attention",
    compare: by.first((u) => !u.emailVerified),
  },
  { id: "banned", label: "Banned first", group: "Needs attention", compare: by.first((u) => !!u.banned) },
];

function userFacets(now: number | null, users: AdminUser[]): Facet<AdminUser>[] {
  const domains = [...new Set(users.map(domain))].sort();
  return [
    {
      id: "status",
      label: "Status",
      mode: "many",
      options: [
        { id: "active", label: "Active" },
        { id: "banned", label: "Banned" },
      ],
      match: (u, o) => (o === "banned" ? !!u.banned : !u.banned),
    },
    {
      id: "email",
      label: "Email",
      mode: "many",
      options: [
        { id: "verified", label: "Verified" },
        { id: "unverified", label: "Not verified" },
      ],
      match: (u, o) => (o === "verified" ? !!u.emailVerified : !u.emailVerified),
    },
    dateFacet("joined", "Joined", (u) => u.createdAt, now),
    {
      id: "role",
      label: "Staff role",
      mode: "many",
      options: STAFF_ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r].label })),
      match: (u, o) => u.role === o,
    },
    {
      id: "domain",
      label: "Email domain",
      mode: "many",
      options: domains.map((d) => ({ id: d, label: d })),
      match: (u, o) => domain(u) === o,
    },
  ];
}

const COPY: Record<BulkAction, { title: string; confirm: string; done: string; destructive?: boolean }> = {
  ban: { title: "Ban users", confirm: "Ban", done: "Banned", destructive: true },
  unban: { title: "Unban users", confirm: "Unban", done: "Unbanned" },
  signOut: { title: "Sign out of all sessions", confirm: "Sign out", done: "Signed out" },
  delete: { title: "Delete accounts", confirm: "Delete", done: "Deleted", destructive: true },
};

export function UsersTable() {
  return (
    <RefreshScope>
      <Users />
    </RefreshScope>
  );
}

function Users() {
  const users = useQuery(api.admin.users);
  const { can, role } = useStaffPermissions();
  const { data: session } = authClient.useSession();
  const [search, setSearch] = useTableState("users.search", "");
  const [filter, setFilter] = useTableState<Filter>("users.filter", "all");
  const [sort, setSort] = useTableState<SortValue>("users.sort", { by: "newest", then: null });
  const [facetValue, setFacetValue] = useTableState<FilterValue>("users.facets", {});
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkAction | null>(null);

  const facets = useMemo(() => userFacets(now, users ?? []), [now, users]);
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        matches(u, filter) && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
    );
  }, [users, search, filter]);
  const faceted = useFacets(searched, facets, facetValue);
  const visible = useMemo(() => sortRows(faceted.rows, SORTS, sort), [faceted.rows, sort]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, facetValue, setPage]);
  const selection = useSelection(useMemo(() => visible.map((u) => u.id), [visible]));
  const chosen = visible.filter((u) => selection.has(u.id));
  // Your own account and (unless you're a super admin) other staff can't be changed in bulk
  const actionable = chosen.filter((u) => u.id !== session?.user.id && (!isStaffRole(u.role) || role === "superadmin"));

  const count = (f: Filter) => (users ?? []).filter((u) => matches(u, f)).length;
  const selected = selectedId ? ((users ?? []).find((u) => u.id === selectedId) ?? null) : null;

  const exportRows = () =>
    downloadCsv("users", chosen.length ? chosen : visible, [
      { header: "Name", value: (u) => u.name },
      { header: "Email", value: (u) => u.email },
      { header: "Account", value: accountLabel },
      { header: "Status", value: (u) => (u.banned ? "Banned" : "Active") },
      { header: "Ban reason", value: (u) => u.banReason ?? "" },
      { header: "Email verified", value: (u) => (u.emailVerified ? "Yes" : "No") },
      { header: "Joined", value: (u) => new Date(u.createdAt).toISOString().slice(0, 10) },
    ]);

  const runAction = async (action: BulkAction, reason: string) => {
    const targets = actionable.filter((u) => (action === "ban" ? !u.banned : action === "unban" ? !!u.banned : true));
    await runBulk(
      targets,
      (u) => {
        if (action === "ban") return authClient.admin.banUser({ userId: u.id, banReason: reason || undefined });
        if (action === "unban") return authClient.admin.unbanUser({ userId: u.id });
        if (action === "signOut") return authClient.admin.revokeUserSessions({ userId: u.id });
        return authClient.admin.removeUser({ userId: u.id });
      },
      { done: COPY[action].done, noun: "account" },
    );
    selection.clear();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Users">
        <CreateUserDialog disabled={!can({ user: ["create"] })} />
      </AdminPageHeader>

      <DataToolbar
        filters={
          <FilterTabs
            label="Filter users"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: count("all") },
              { id: "sme", label: "SMEs", count: count("sme") },
              { id: "enterprise", label: "Enterprise", count: count("enterprise") },
              { id: "staff", label: "Staff", count: count("staff") },
              { id: "unassigned", label: "Not set up", count: count("unassigned") },
              { id: "banned", label: "Banned", count: count("banned") },
            ]}
          />
        }
        search={search}
        onSearch={setSearch}
        controls={
          <>
            <FilterMenu facets={facets} value={facetValue} onChange={setFacetValue} counts={faceted.counts} />
            <SortMenu strategies={SORTS} value={sort} onChange={setSort} />
          </>
        }
        chips={<ActiveFilters facets={facets} value={facetValue} onChange={setFacetValue} />}
        searchLabel="Search name or email"
        onExport={exportRows}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <SelectAllCheckbox selection={selection} label="Select all users" />
              </TableHead>
              <TableHead>User</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users === undefined &&
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {users !== undefined && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No users match.
                </TableCell>
              </TableRow>
            )}
            {pagination.rows.map((user) => (
              <TableRow
                key={user.id}
                data-state={selection.has(user.id) ? "selected" : undefined}
                className={cn("cursor-pointer", user.banned && "opacity-70")}
                onClick={() => setSelectedId(user.id)}
              >
                <TableCell className="pl-4">
                  <RowCheckbox selection={selection} id={user.id} label={`Select ${user.name}`} />
                </TableCell>
                <TableCell className="max-w-72">
                  <button type="button" className="w-full text-left" aria-label={`Open ${user.name}`}>
                    <Identity name={user.name} detail={user.email} />
                  </button>
                </TableCell>
                <TableCell>
                  <AccountPills user={user} />
                </TableCell>
                <TableCell>
                  {user.banned ? <Status tone="danger">Banned</Status> : <Status tone="success">Active</Status>}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatDate(user.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="users" />

      <BulkBar selection={selection} noun="user">
        <Button size="sm" variant="outline" disabled={!can({ user: ["ban"] })} onClick={() => setBulk("ban")}>
          Ban
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ user: ["ban"] })} onClick={() => setBulk("unban")}>
          Unban
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ session: ["revoke"] })} onClick={() => setBulk("signOut")}>
          Sign out
        </Button>
        <Button size="sm" variant="outline" disabled={!can({ user: ["delete"] })} onClick={() => setBulk("delete")}>
          Delete
        </Button>
        <Button size="sm" variant="outline" onClick={exportRows}>
          Export
        </Button>
      </BulkBar>

      {bulk && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setBulk(null)}
          title={`${COPY[bulk].title} (${actionable.length})`}
          description={
            actionable.length < chosen.length
              ? `${chosen.length - actionable.length} selected account${chosen.length - actionable.length === 1 ? " is" : "s are"} skipped: your own, or staff you can’t change.`
              : bulk === "delete"
                ? "Accounts, SME profiles and documents are deleted permanently."
                : undefined
          }
          confirmLabel={COPY[bulk].confirm}
          destructive={COPY[bulk].destructive}
          reason={bulk === "ban" ? { label: "Reason" } : undefined}
          onConfirm={(reason) => runAction(bulk, reason)}
        />
      )}

      <UserInspector user={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
