"use client";

import { useQuery } from "convex/react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { UserView } from "@/components/auth/user/user-view";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { isStaffRole, ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { CreateUserDialog } from "./create-user-dialog";
import { AdminPageHeader, Pill } from "./page-header";
import { FilterTabs, TablePagination, usePagination } from "./shared";
import { type AdminUser, toViewUser, UserInspector } from "./user-inspector";

type Filter = "all" | "sme" | "enterprise" | "staff" | "unassigned" | "banned";
type SortKey = "name" | "createdAt";

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

export function AccountPills({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.accountType === "staff" && isStaffRole(user.role) && <Pill tone="info">{ROLE_LABELS[user.role].label}</Pill>}
      {user.accountType === "sme" && <Pill>SME</Pill>}
      {user.accountType === "enterprise" && <Pill>Enterprise</Pill>}
      {!user.accountType && <Pill tone="warning">Not set up</Pill>}
    </div>
  );
}

export function UsersTable() {
  const users = useQuery(api.admin.users);
  const { can } = useStaffPermissions();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "createdAt", desc: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (users ?? []).filter(
      (u) => matches(u, filter) && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
    );
    return rows.sort((a, b) => {
      const cmp = sort.key === "createdAt" ? a.createdAt - b.createdAt : a[sort.key].localeCompare(b[sort.key]);
      return sort.desc ? -cmp : cmp;
    });
  }, [users, search, filter, sort]);

  const pagination = usePagination(visible);
  const { setPage } = pagination;
  useEffect(() => setPage(0), [search, filter, setPage]);

  const count = (f: Filter) => (users ?? []).filter((u) => matches(u, f)).length;
  // Read the selected user from the live query so the inspector reflects changes immediately
  const selected = selectedId ? ((users ?? []).find((u) => u.id === selectedId) ?? null) : null;

  const sortHead = (key: SortKey, label: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDownIcon : sort.desc ? ArrowDownIcon : ArrowUpIcon;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "createdAt" }))}
      >
        {label}
        <Icon className={cn(!active && "opacity-40")} />
      </Button>
    );
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Users"
        description="Every account on YES Hub: SMEs, enterprise members, staff and people who haven’t set up yet."
      >
        <CreateUserDialog disabled={!can({ user: ["create"] })} />
      </AdminPageHeader>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
        <InputGroup className="lg:w-72">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search name or email"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sortHead("name", "User")}</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">{sortHead("createdAt", "Joined")}</TableHead>
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
                className={cn("cursor-pointer", user.banned && "opacity-70")}
                onClick={() => setSelectedId(user.id)}
              >
                <TableCell>
                  <button type="button" className="text-left" aria-label={`Open ${user.name}`}>
                    <UserView user={toViewUser(user)} />
                  </button>
                </TableCell>
                <TableCell>
                  <AccountPills user={user} />
                </TableCell>
                <TableCell>{user.banned ? <Pill tone="danger">Banned</Pill> : <Pill tone="success">Active</Pill>}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(user.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination pagination={pagination} noun="users" />
      <UserInspector user={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}
