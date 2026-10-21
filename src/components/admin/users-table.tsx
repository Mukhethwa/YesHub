"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { EllipsisIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/sme/format";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader, Pill } from "./page-header";

type AdminUser = NonNullable<FunctionReturnType<typeof api.admin.users>>[number];

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sme", label: "SMEs" },
  { id: "enterprise", label: "Enterprise" },
  { id: "unassigned", label: "Not set up" },
  { id: "admin", label: "Admins" },
  { id: "banned", label: "Banned" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(user: AdminUser, filter: Filter) {
  switch (filter) {
    case "all":
      return true;
    case "sme":
    case "enterprise":
      return user.accountType === filter;
    case "unassigned":
      return user.accountType === null && user.role !== "admin";
    case "admin":
      return user.role === "admin";
    case "banned":
      return !!user.banned;
  }
}

/** Better Auth client calls resolve with `{ error }` instead of throwing. */
async function run(label: string, call: () => Promise<{ error: { message?: string } | null }>) {
  const { error } = await call();
  if (error) toast.error(error.message || `Couldn’t ${label.toLowerCase()}.`);
  else toast.success(label);
  return !error;
}

export function UsersTable() {
  const users = useQuery(api.admin.users);
  const { data: session } = authClient.useSession();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [banning, setBanning] = useState<AdminUser | null>(null);
  const [promoting, setPromoting] = useState<AdminUser | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? []).filter(
      (u) => matches(u, filter) && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)),
    );
  }, [users, search, filter]);

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Users" description="Every account on YES Hub. Ban, change roles or view the platform as someone else.">
        <InputGroup className="sm:w-72">
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
      </AdminPageHeader>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter users">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {users === undefined ? (
        <Spinner className="mx-auto mt-12" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No users match.
                  </TableCell>
                </TableRow>
              )}
              {visible.map((user) => {
                const isSelf = user.id === session?.user.id;
                return (
                  <TableRow key={user.id} className={cn(user.banned && "opacity-70")}>
                    <TableCell>
                      <p className="font-medium">
                        {user.name}
                        {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.role === "admin" && <Pill tone="info">Admin</Pill>}
                        {user.accountType === "sme" && <Pill>SME</Pill>}
                        {user.accountType === "enterprise" && <Pill>Enterprise</Pill>}
                        {!user.accountType && user.role !== "admin" && <Pill tone="warning">Not set up</Pill>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <div>
                          <Pill tone="danger">Banned</Pill>
                          {user.banReason && <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground">{user.banReason}</p>}
                        </div>
                      ) : (
                        <Pill tone="success">Active</Pill>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <UserActions
                        user={user}
                        isSelf={isSelf}
                        onBan={() => setBanning(user)}
                        onPromote={() => setPromoting(user)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <BanDialog user={banning} onClose={() => setBanning(null)} />
      <PromoteDialog user={promoting} onClose={() => setPromoting(null)} />
    </div>
  );
}

function UserActions({
  user,
  isSelf,
  onBan,
  onPromote,
}: {
  user: AdminUser;
  isSelf: boolean;
  onBan: () => void;
  onPromote: () => void;
}) {
  const isAdmin = user.role === "admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${user.name}`}>
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSelf || isAdmin || !!user.banned}
          onSelect={async () => {
            const { error } = await authClient.admin.impersonateUser({ userId: user.id });
            if (error) return toast.error(error.message || "Couldn’t view as this user.");
            // Full reload so every query re-authenticates as the impersonated user
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload re-authenticates every query
            window.location.assign("/start");
          }}
        >
          View as this user
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isSelf}
          onSelect={() => run("Signed out everywhere", () => authClient.admin.revokeUserSessions({ userId: user.id }))}
        >
          Sign out everywhere
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAdmin ? (
          <DropdownMenuItem
            disabled={isSelf}
            onSelect={() => run("Admin role removed", () => authClient.admin.setRole({ userId: user.id, role: "user" }))}
          >
            Remove admin role
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={!!user.banned} onSelect={onPromote}>
            Make admin
          </DropdownMenuItem>
        )}
        {user.banned ? (
          <DropdownMenuItem onSelect={() => run("User unbanned", () => authClient.admin.unbanUser({ userId: user.id }))}>
            Unban
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" disabled={isSelf || isAdmin} onSelect={onBan}>
            Ban…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BanDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const ban = async () => {
    if (!user) return;
    setBusy(true);
    const ok = await run("User banned", () =>
      authClient.admin.banUser({ userId: user.id, banReason: reason.trim() || undefined }),
    );
    setBusy(false);
    if (ok) {
      setReason("");
      onClose();
    }
  };

  return (
    <AlertDialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ban {user?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They’re signed out everywhere and can’t sign in until you unban them. Their data stays as it is.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (shown to other admins)"
          aria-label="Ban reason"
          rows={3}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void ban();
            }}
          >
            {busy && <Spinner />}
            Ban user
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PromoteDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  return (
    <AlertDialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Make {user?.name} an admin?</AlertDialogTitle>
          <AlertDialogDescription>
            Admins can see every account, ban people and view the platform as any user.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (user) void run("Admin role granted", () => authClient.admin.setRole({ userId: user.id, role: "admin" }));
              onClose();
            }}
          >
            Make admin
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
