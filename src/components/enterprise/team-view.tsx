"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AdminPageHeader, Pill } from "@/components/admin/page-header";
import { runAuthAction, runMutation } from "@/components/admin/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CreateOrganisation } from "./create-organisation";
import { OpportunityTable } from "./enterprise-overview";
import { closingLabel, phaseOf } from "./tenders";

type Team = NonNullable<FunctionReturnType<typeof api.enterprise.team>>;
type Member = Team["members"][number];
type Department = Team["departments"][number];
type Opportunity = Team["opportunities"][number];

const roleLabel = (role: string) => ORG_ROLE_LABELS[role as OrgRole] ?? role;

/** "an owner", "an admin", "a member". */
export function roleWithArticle(role: string) {
  const label = roleLabel(role).toLowerCase();
  return `${/^[aeiou]/.test(label) ? "an" : "a"} ${label}`;
}
const isOpen = (o: Opportunity) => phaseOf(o) !== "closed";

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function TeamView() {
  const team = useQuery(api.enterprise.team);

  if (team === undefined) return <Spinner className="mx-auto mt-24" />;
  if (team === null) return <CreateOrganisation />;

  const { me, departments, members, opportunities } = team;
  const myDepartments = departments.filter((d) => me.teamIds.includes(d.id));
  const myWork = opportunities.filter((o) => o.teamId && me.teamIds.includes(o.teamId));
  const unassigned = opportunities.filter((o) => !o.teamId);
  const awaiting = myWork.filter(isOpen).reduce((sum, o) => sum + o.awaitingReview, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Team"
        description={`You’re ${roleWithArticle(me.role)}${
          myDepartments.length ? ` in ${myDepartments.map((d) => d.name).join(" and ")}` : ""
        }`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Members"
          value={members.length}
          note={`${team.invitations.length} invitation${team.invitations.length === 1 ? "" : "s"} pending`}
        />
        <Stat
          label="Departments"
          value={departments.length}
          note={`${unassigned.length} opportunit${unassigned.length === 1 ? "y" : "ies"} unassigned`}
        />
        <Stat
          label="Your departments’ open work"
          value={myWork.filter(isOpen).length}
          note={`${myWork.length} opportunities in total`}
        />
        <Stat
          label="Awaiting review"
          value={awaiting}
          note="Applications in your departments nobody has shortlisted yet"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your departments’ opportunities</CardTitle>
          <CardDescription>
            {myDepartments.length
              ? `Tenders, RFQs and grants owned by ${myDepartments.map((d) => d.name).join(" and ")}.`
              : "You’re not in a department yet. An owner or admin can add you to one below."}
          </CardDescription>
        </CardHeader>
        {myWork.length > 0 && (
          <CardContent className="px-0">
            <OpportunityTable rows={myWork} />
          </CardContent>
        )}
      </Card>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Departments</h2>
            <p className="text-sm text-muted-foreground">Who works in each department and the opportunities it owns.</p>
          </div>
          {me.canManage && <CreateDepartment />}
        </div>
        {departments.length === 0 ? (
          <p className="rounded-xl border bg-card px-5 py-6 text-sm text-muted-foreground">
            No departments yet. Create one for each team that runs tenders, such as Procurement or Facilities.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {departments.map((d) => (
              <DepartmentCard
                key={d.id}
                department={d}
                members={members.filter((m) => m.teamIds.includes(d.id))}
                opportunities={opportunities.filter((o) => o.teamId === d.id)}
                mine={me.teamIds.includes(d.id)}
                canManage={me.canManage}
              />
            ))}
          </div>
        )}
      </section>

      {unassigned.length > 0 && <UnassignedCard opportunities={unassigned} departments={departments} me={me} />}

      <MembersCard team={team} />

      {me.canManage && <InvitationsCard team={team} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Departments                                                                                            */
/* ------------------------------------------------------------------------------------------------------ */

function DepartmentCard({
  department,
  members,
  opportunities,
  mine,
  canManage,
}: {
  department: Department;
  members: Member[];
  opportunities: Opportunity[];
  mine: boolean;
  canManage: boolean;
}) {
  const open = opportunities.filter(isOpen);
  const awaiting = open.reduce((sum, o) => sum + o.awaitingReview, 0);
  const nextClosing = [...open].sort((a, b) => a.closesAt.localeCompare(b.closesAt))[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {department.name}
          {mine && <Pill tone="info">Your department</Pill>}
        </CardTitle>
        <CardDescription>
          {members.length} member{members.length === 1 ? "" : "s"}, {open.length} open,{" "}
          {opportunities.length - open.length} closed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {members.length === 0 ? (
            <span className="text-muted-foreground">No members yet</span>
          ) : (
            members.map((m) => (
              <span key={m.id} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                {m.name}
              </span>
            ))
          )}
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Awaiting review</dt>
            <dd className="text-lg font-semibold tabular-nums">{awaiting}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Next closing</dt>
            <dd className="truncate">{nextClosing ? closingLabel(nextClosing.closesAt) : "Nothing open"}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/opportunities?department=${department.id}`}>View opportunities</Link>
          </Button>
          {canManage && <DeleteDepartment department={department} owns={opportunities.length} />}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateDepartment() {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const ok = await runAuthAction(`${name.trim()} created`, () =>
      authClient.organization.createTeam({ name: name.trim() }),
    );
    if (ok) setName("");
    setPending(false);
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New department, e.g. Marketing"
        aria-label="New department name"
        className="sm:w-64"
      />
      <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
        {pending && <Spinner />}
        Add department
      </Button>
    </form>
  );
}

function DeleteDepartment({ department, owns }: { department: Department; owns: number }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {department.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its members stay in the organisation.
            {owns > 0 &&
              ` Its ${owns} opportunit${owns === 1 ? "y becomes" : "ies become"} unassigned until you move ${owns === 1 ? "it" : "them"} to another department.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              runAuthAction(`${department.name} deleted`, () =>
                authClient.organization.removeTeam({ teamId: department.id }),
              )
            }
          >
            Delete department
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Lets a member pick one of their departments, or an owner/admin any department. */
export function DepartmentSelect({
  opportunityId,
  value,
  departments,
  allowed,
  className,
}: {
  opportunityId: Id<"opportunities">;
  value: string | null;
  departments: { id: string; name: string }[];
  /** Departments the user may move it into. */
  allowed: string[];
  className?: string;
}) {
  const setDepartment = useMutation(api.enterprise.setOpportunityDepartment);
  return (
    <Select
      value={value ?? "none"}
      onValueChange={(next) => {
        const name = departments.find((d) => d.id === next)?.name;
        void runMutation(name ? `Moved to ${name}` : "Moved out of its department", () =>
          setDepartment({ opportunityId, teamId: next === "none" ? null : next }),
        );
      }}
    >
      <SelectTrigger className={className ?? "w-48"} aria-label="Department">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No department</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id} disabled={!allowed.includes(d.id) && d.id !== value}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UnassignedCard({
  opportunities,
  departments,
  me,
}: {
  opportunities: Opportunity[];
  departments: Department[];
  me: Team["me"];
}) {
  const allowed = me.canManage ? departments.map((d) => d.id) : me.teamIds;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Not in a department</CardTitle>
        <CardDescription>
          Give each opportunity a department so its team sees it in their work.
          {!me.canManage && " You can move these into your own departments."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y border-t">
          {opportunities.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/dashboard/opportunities?id=${o.id}`} className="min-w-0 text-sm">
                <span className="block truncate font-medium hover:underline">{o.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {o.reference}, {closingLabel(o.closesAt)}
                </span>
              </Link>
              <DepartmentSelect opportunityId={o.id} value={null} departments={departments} allowed={allowed} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Members and invitations                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

function MembersCard({ team }: { team: Team }) {
  const { me, members, departments } = team;
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Owners and admins manage the team and settings; members review applicants and move work within their
          departments.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Departments</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="pr-6 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const self = m.userId === me.userId;
              const editable = me.canManage && !self && m.role !== "owner";
              return (
                <TableRow key={m.id}>
                  <TableCell className="max-w-64 pl-6">
                    <span className="block truncate font-medium">
                      {m.name}
                      {self && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          runAuthAction(`${m.name} is now ${roleLabel(role).toLowerCase()}`, () =>
                            authClient.organization.updateMemberRole({
                              memberId: m.id,
                              role: role as "admin" | "member",
                            }),
                          )
                        }
                      >
                        <SelectTrigger className="w-32" aria-label={`Role for ${m.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Pill tone={m.role === "owner" ? "info" : "neutral"}>{roleLabel(m.role)}</Pill>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-sm">
                    {m.teamIds.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      m.teamIds
                        .map((id) => departmentName.get(id))
                        .filter(Boolean)
                        .join(", ")
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(m.createdAt)}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end gap-1.5">
                      {me.canManage && departments.length > 0 && (
                        <EditDepartments member={m} departments={departments} />
                      )}
                      {editable && <RemoveMember member={m} />}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EditDepartments({ member, departments }: { member: Member; departments: Department[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(member.teamIds);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setPending(true);
    const add = selected.filter((id) => !member.teamIds.includes(id));
    const remove = member.teamIds.filter((id) => !selected.includes(id));
    let ok = true;
    for (const teamId of add) {
      const { error } = await authClient.organization.addTeamMember({ teamId, userId: member.userId });
      if (error) ok = false;
    }
    for (const teamId of remove) {
      const { error } = await authClient.organization.removeTeamMember({ teamId, userId: member.userId });
      if (error) ok = false;
    }
    setPending(false);
    if (ok) {
      toast.success(`${member.name}’s departments updated`);
      setOpen(false);
    } else toast.error("Some changes didn’t save. Please try again.");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSelected(member.teamIds);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Departments
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{member.name}’s departments</DialogTitle>
          <DialogDescription>They’ll see these departments’ opportunities as their own work.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {departments.map((d) => (
            <Label key={d.id} className="flex items-center gap-3 font-normal">
              <Checkbox
                checked={selected.includes(d.id)}
                onCheckedChange={(checked) =>
                  setSelected((s) => (checked ? [...s, d.id] : s.filter((id) => id !== d.id)))
                }
              />
              {d.name}
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending && <Spinner />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMember({ member }: { member: Member }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to your organisation’s opportunities and applicants. Their account stays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              runAuthAction(`${member.name} removed`, () =>
                authClient.organization.removeMember({ memberIdOrEmail: member.id }),
              )
            }
          >
            Remove from organisation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InvitationsCard({ team }: { team: Team }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [teamId, setTeamId] = useState("none");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Enter a valid email address.");
    setPending(true);
    const ok = await runAuthAction(`Invitation sent to ${email.trim()}`, () =>
      authClient.organization.inviteMember({
        email: email.trim(),
        role,
        ...(teamId !== "none" ? { teamId } : {}),
      }),
    );
    if (ok) setEmail("");
    setPending(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>They get an email with a link to join {team.organization.name}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={submit} className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.co.za"
            />
          </div>
          <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
            <SelectTrigger className="lg:w-32" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          {team.departments.length > 0 && (
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="lg:w-48" aria-label="Department">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {team.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Send invitation
          </Button>
        </form>

        {team.invitations.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pending invitations</p>
            <ul className="divide-y rounded-lg border">
              {team.invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {roleLabel(i.role ?? "member")}, expires {formatDate(i.expiresAt)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      runAuthAction("Invitation cancelled", () =>
                        authClient.organization.cancelInvitation({ invitationId: i.id }),
                      )
                    }
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
