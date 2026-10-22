"use client";

import { useQuery as useTanstackQuery, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CopyIcon, MonitorIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { UserView } from "@/components/auth/user/user-view";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { authClient } from "@/lib/auth-client";
import { isStaffRole, ROLE_LABELS } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { Pill } from "./page-header";
import { formatDateTime, runAuthAction } from "./shared";

export type AdminUser = NonNullable<FunctionReturnType<typeof api.admin.users>>[number];

/** UserView wants Better Auth's client User shape; the Convex rows carry timestamps as numbers. */
export const toViewUser = (user: Pick<AdminUser, "name" | "email" | "image">) => ({
  name: user.name,
  email: user.email,
  image: user.image,
});

const BAN_DURATIONS = [
  { id: "forever", label: "Until unbanned", seconds: undefined },
  { id: "1d", label: "1 day", seconds: 60 * 60 * 24 },
  { id: "7d", label: "7 days", seconds: 60 * 60 * 24 * 7 },
  { id: "30d", label: "30 days", seconds: 60 * 60 * 24 * 30 },
] as const;

/** Side panel for one account: profile, YES Hub context, security, access and sessions. */
export function UserInspector({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  return (
    <Sheet open={!!user} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {user && <Inspector key={user.id} user={user} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Inspector({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { can, role: myRole } = useStaffPermissions();
  const { data: session } = authClient.useSession();
  const isSelf = session?.user.id === user.id;
  const targetIsStaff = isStaffRole(user.role);
  // Only super admins act on other staff (enforced by the server too)
  const locked = isSelf || (targetIsStaff && myRole !== "superadmin");

  return (
    <>
      <SheetHeader className="border-b p-6">
        <SheetTitle className="sr-only">{user.name}</SheetTitle>
        <SheetDescription className="sr-only">Account details for {user.email}</SheetDescription>
        <UserView user={toViewUser(user)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isStaffRole(user.role) && <Pill tone="info">{ROLE_LABELS[user.role].label}</Pill>}
          {user.accountType === "sme" && <Pill>SME</Pill>}
          {user.accountType === "enterprise" && <Pill>Enterprise</Pill>}
          {!user.accountType && <Pill tone="warning">Not set up</Pill>}
          {user.banned ? <Pill tone="danger">Banned</Pill> : <Pill tone="success">Active</Pill>}
        </div>
        {locked && (
          <p className="mt-3 text-sm text-muted-foreground">
            {isSelf
              ? "This is your account. Manage it from your account settings."
              : "Only a super admin can change another staff account."}
          </p>
        )}
      </SheetHeader>

      <Tabs defaultValue="overview" className="gap-0">
        <TabsList className="mx-6 mt-4">
          <TabsTrigger value="overview">
            <UserRoundIcon />
            Overview
          </TabsTrigger>
          <TabsTrigger value="sessions" disabled={!can({ session: ["list"] })}>
            <MonitorIcon />
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 p-6">
          <AccountSection user={user} />
          <Separator />
          <ProfileSection user={user} disabled={locked || !can({ user: ["update"] })} />
          <Separator />
          <PasswordSection user={user} disabled={locked || !can({ user: ["set-password"] })} />
          <Separator />
          <AccessSection user={user} locked={locked} onDeleted={onClose} />
        </TabsContent>

        <TabsContent value="sessions" className="p-6">
          <SessionsSection user={user} disabled={locked || !can({ session: ["revoke"] })} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-medium">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function AccountSection({ user }: { user: AdminUser }) {
  const context = useQuery(api.admin.userContext, { userId: user.id });

  return (
    <Section title="Account">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="flex items-center gap-1">
            <code className="truncate text-xs">{user.id}</code>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Copy user ID"
              onClick={() => navigator.clipboard.writeText(user.id).then(() => toast.success("User ID copied"))}
            >
              <CopyIcon />
            </Button>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Joined</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Email verified</dt>
          <dd>{user.emailVerified ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">On YES Hub</dt>
          <dd>
            {context === undefined ? (
              <Spinner />
            ) : context?.sme ? (
              <Link href={`/admin/smes?id=${context.sme.id}`} className="underline underline-offset-2">
                SME: {context.sme.companyName}
              </Link>
            ) : context?.organization ? (
              context.organization.kind === "staff" ? (
                "YES Hub staff"
              ) : (
                <Link
                  href={`/admin/organisations?id=${context.organization.id}`}
                  className="underline underline-offset-2"
                >
                  {context.organization.name} ({context.organization.role})
                </Link>
              )
            ) : (
              "Hasn’t registered a business or organisation"
            )}
          </dd>
        </div>
        {user.banned && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Ban</dt>
            <dd>
              {user.banReason || "No reason given"}
              {user.banExpires ? `, until ${formatDateTime(user.banExpires)}` : ", until unbanned"}
            </dd>
          </div>
        )}
      </dl>
    </Section>
  );
}

function ProfileSection({ user, disabled }: { user: AdminUser; disabled: boolean }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await runAuthAction("Profile updated", () =>
      authClient.admin.updateUser({ userId: user.id, data: { name: name.trim(), email: email.trim().toLowerCase() } }),
    );
    setBusy(false);
  };

  return (
    <Section title="Profile">
      <form onSubmit={save} className="space-y-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="admin-user-name">Name</FieldLabel>
            <Input
              id="admin-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={disabled}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-user-email">Email</FieldLabel>
            <Input
              id="admin-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" variant="outline" disabled={disabled || !dirty || busy}>
          {busy && <Spinner />}
          Save changes
        </Button>
      </form>
    </Section>
  );
}

function PasswordSection({ user, disabled }: { user: AdminUser; disabled: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await runAuthAction("Password set", () =>
      authClient.admin.setUserPassword({ userId: user.id, newPassword: password }),
    );
    setBusy(false);
    if (ok) setPassword("");
  };

  return (
    <Section
      title="Password"
      description="Set a new password, e.g. when someone is locked out. Their other sessions stay signed in."
    >
      <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="admin-user-password">New password</FieldLabel>
          <Input
            id="admin-user-password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={disabled || password.length < 8 || busy}>
          {busy && <Spinner />}
          Set password
        </Button>
      </form>
    </Section>
  );
}

function AccessSection({ user, locked, onDeleted }: { user: AdminUser; locked: boolean; onDeleted: () => void }) {
  const { can } = useStaffPermissions();
  const [banOpen, setBanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isStaff = isStaffRole(user.role);

  const impersonate = async () => {
    setBusy(true);
    const { error } = await authClient.admin.impersonateUser({ userId: user.id });
    if (error) {
      setBusy(false);
      return toast.error(error.message || "Couldn’t view as this user.");
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload re-authenticates every query
    window.location.assign("/start");
  };

  return (
    <Section title="Access" description="Changes take effect immediately and are recorded in the audit log.">
      <div className="divide-y rounded-lg border">
        <AccessRow
          title={user.banned ? "Unban" : "Ban"}
          description={
            user.banned
              ? "Let them sign in again."
              : "Sign them out everywhere and block sign-in. Their data stays as it is."
          }
        >
          {user.banned ? (
            <Button
              variant="outline"
              size="sm"
              disabled={locked || !can({ user: ["ban"] }) || busy}
              onClick={() => runAuthAction("User unbanned", () => authClient.admin.unbanUser({ userId: user.id }))}
            >
              Unban
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={locked || !can({ user: ["ban"] })}
              onClick={() => setBanOpen(true)}
            >
              Ban…
            </Button>
          )}
        </AccessRow>
        <AccessRow
          title="View as this user"
          description="See YES Hub exactly as they do. A banner lets you switch back."
        >
          <Button
            variant="outline"
            size="sm"
            disabled={
              locked || !!user.banned || !can({ user: [isStaff ? "impersonate-admins" : "impersonate"] }) || busy
            }
            onClick={impersonate}
          >
            {busy && <Spinner />}
            View as user
          </Button>
        </AccessRow>
        <AccessRow title="Sign out everywhere" description="End every session on every device.">
          <Button
            variant="outline"
            size="sm"
            disabled={locked || !can({ session: ["revoke"] })}
            onClick={() =>
              runAuthAction("Signed out everywhere", () => authClient.admin.revokeUserSessions({ userId: user.id }))
            }
          >
            Sign out
          </Button>
        </AccessRow>
        <AccessRow
          title="Delete account"
          description="Permanently delete the account, its SME profile and documents. Organisations they own are kept."
        >
          <Button
            variant="destructive"
            size="sm"
            disabled={locked || !can({ user: ["delete"] })}
            onClick={() => setDeleteOpen(true)}
          >
            Delete…
          </Button>
        </AccessRow>
      </div>

      <BanDialog user={user} open={banOpen} onOpenChange={setBanOpen} />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {user.email} and everything YES Hub holds for them is deleted. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (await runAuthAction("Account deleted", () => authClient.admin.removeUser({ userId: user.id })))
                  onDeleted();
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function AccessRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function BanDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<(typeof BAN_DURATIONS)[number]["id"]>("forever");
  const [busy, setBusy] = useState(false);

  const ban = async () => {
    setBusy(true);
    const seconds = BAN_DURATIONS.find((d) => d.id === duration)?.seconds;
    const ok = await runAuthAction("User banned", () =>
      authClient.admin.banUser({ userId: user.id, banReason: reason.trim() || undefined, banExpiresIn: seconds }),
    );
    setBusy(false);
    if (ok) {
      setReason("");
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ban {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They’re signed out everywhere and can’t sign in until the ban ends.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ban-reason">Reason</FieldLabel>
            <Textarea id="ban-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <FieldDescription>Visible to other staff in the admin area and the audit log.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ban-duration">Duration</FieldLabel>
            <Select value={duration} onValueChange={(v) => setDuration(v as typeof duration)}>
              <SelectTrigger id="ban-duration" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAN_DURATIONS.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
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

type AdminSession = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  expiresAt: Date | string;
  impersonatedBy?: string | null;
};

/** Rough device label from a user agent, e.g. "Chrome on Windows". */
function describeAgent(agent?: string | null) {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Chrome\//.test(agent)
      ? "Chrome"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(agent)
    ? "Windows"
    : /Android/.test(agent)
      ? "Android"
      : /iPhone|iPad/.test(agent)
        ? "iOS"
        : /Mac OS/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** Expired sessions linger until cleaned up; only list live ones. */
function liveSessions(sessions: AdminSession[]) {
  const now = Date.now();
  return sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
}

function SessionsSection({ user, disabled }: { user: AdminUser; disabled: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin", "user-sessions", user.id];
  const sessions = useTanstackQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await authClient.admin.listUserSessions({ userId: user.id });
      if (error) throw new Error(error.message);
      return liveSessions((data?.sessions ?? []) as AdminSession[]);
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  if (sessions.isPending) return <Spinner className="mx-auto" />;
  if (sessions.isError) return <p className="text-sm text-destructive">Couldn’t load sessions.</p>;

  const active = sessions.data;

  return (
    <Section title="Sessions" description="Devices currently signed in to this account.">
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {active.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {describeAgent(s.userAgent)}
                  {s.impersonatedBy && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(staff viewing)</span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  {s.ipAddress ? `${s.ipAddress}, ` : ""}since {formatDateTime(s.createdAt)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={async () => {
                  if (
                    await runAuthAction("Session ended", () =>
                      authClient.admin.revokeUserSession({ sessionToken: s.token }),
                    )
                  )
                    refresh();
                }}
              >
                Sign out
              </Button>
            </li>
          ))}
        </ul>
      )}
      {active.length > 1 && (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={async () => {
            if (
              await runAuthAction("Signed out everywhere", () =>
                authClient.admin.revokeUserSessions({ userId: user.id }),
              )
            )
              refresh();
          }}
        >
          Sign out of all sessions
        </Button>
      )}
    </Section>
  );
}
