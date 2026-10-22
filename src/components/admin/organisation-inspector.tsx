"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { ORG_ROLE_LABELS, type OrgRole } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { Pill } from "./page-header";
import { formatDateTime, runMutation } from "./shared";

type OrgDetail = NonNullable<FunctionReturnType<typeof api.admin.organization>>;
type Status = "verified" | "rejected" | "unverified";

export function VerificationPill({ status }: { status: string }) {
  if (status === "verified") return <Pill tone="success">Verified</Pill>;
  if (status === "rejected") return <Pill tone="danger">Rejected</Pill>;
  return <Pill tone="warning">Awaiting review</Pill>;
}

const roleLabel = (role: string) =>
  role
    .split(",")
    .map((r) => ORG_ROLE_LABELS[r.trim() as OrgRole] ?? r)
    .join(", ");

/** Side panel for one enterprise: verification, members, teams and invitations. */
export function OrganisationInspector({
  organizationId,
  onClose,
}: {
  organizationId: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!organizationId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {organizationId && <Inspector key={organizationId} organizationId={organizationId} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Inspector({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const detail = useQuery(api.admin.organization, { organizationId });

  if (detail === undefined) {
    return (
      <>
        <SheetTitle className="sr-only">Loading organisation</SheetTitle>
        <Spinner className="m-auto mt-24" />
      </>
    );
  }
  if (detail === null) {
    return (
      <SheetHeader className="p-6">
        <SheetTitle>Organisation not found</SheetTitle>
        <SheetDescription>It may have been deleted.</SheetDescription>
      </SheetHeader>
    );
  }

  const { organization: org, members, teams, invitations } = detail;
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <>
      <SheetHeader className="border-b p-6">
        <SheetTitle className="text-lg">{org.name}</SheetTitle>
        <SheetDescription>
          @{org.slug}, created {formatDate(org.createdAt)}
        </SheetDescription>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <VerificationPill status={org.verificationStatus} />
          <Pill>
            {members.length} {members.length === 1 ? "member" : "members"}
          </Pill>
          <Pill>
            {teams.length} {teams.length === 1 ? "team" : "teams"}
          </Pill>
        </div>
      </SheetHeader>

      <div className="space-y-6 p-6">
        <Verification detail={detail} />

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="invitations">
              Invitations{invitations.length > 0 && ` (${invitations.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-3">
            <Members detail={detail} teamName={teamName} />
          </TabsContent>

          <TabsContent value="teams" className="mt-3">
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No teams yet. Tenders are posted from the whole organisation.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Members</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.map((team) => (
                      <TableRow key={team.id}>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell className="tabular-nums">{team.memberCount}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(team.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="invitations" className="mt-3">
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center justify-between gap-3 p-3">
                    <span className="truncate">{invitation.email}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {invitation.role ? roleLabel(invitation.role) : "Member"}, expires{" "}
                      {formatDate(invitation.expiresAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <DangerZone org={org} onDeleted={onClose} />
      </div>
    </>
  );
}

function Verification({ detail }: { detail: OrgDetail }) {
  const { can } = useStaffPermissions();
  const setVerification = useMutation(api.admin.setOrganizationVerification);
  const { organization: org } = detail;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Status | null>(null);

  const decide = async (status: Status, success: string) => {
    setBusy(status);
    const ok = await runMutation(success, () => setVerification({ organizationId: org.id, status, note }));
    setBusy(null);
    if (ok) setNote("");
  };
  const disabled = !can({ organization: ["verify"] }) || busy !== null;

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="font-medium">Verification</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {org.verificationStatus === "verified"
            ? `Verified ${formatDateTime(org.verifiedAt)}. They can post opportunities.`
            : org.verificationStatus === "rejected"
              ? "Rejected. They can’t post opportunities."
              : "Check this is a real company and that the people in it work there. Until then they can’t post opportunities."}
        </p>
        {org.verificationNote && (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Note: </span>
            {org.verificationNote}
          </p>
        )}
      </div>
      <Field>
        <FieldLabel htmlFor="verification-note" className="sr-only">
          Note
        </FieldLabel>
        <Textarea
          id="verification-note"
          rows={2}
          placeholder="Note for other staff, e.g. how you checked"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!can({ organization: ["verify"] })}
        />
        <FieldDescription>Saved with the decision and in the audit log.</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2">
        {org.verificationStatus !== "verified" && (
          <Button size="sm" disabled={disabled} onClick={() => decide("verified", "Organisation verified")}>
            {busy === "verified" && <Spinner />}
            Verify
          </Button>
        )}
        {org.verificationStatus !== "rejected" && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => decide("rejected", "Organisation rejected")}
          >
            {busy === "rejected" && <Spinner />}
            Reject
          </Button>
        )}
        {org.verificationStatus !== "unverified" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => decide("unverified", "Moved back to review")}
          >
            {busy === "unverified" && <Spinner />}
            Back to review
          </Button>
        )}
      </div>
    </section>
  );
}

function Members({ detail, teamName }: { detail: OrgDetail; teamName: Map<string, string> }) {
  const { can } = useStaffPermissions();
  const removeMember = useMutation(api.admin.removeOrganizationMember);
  const [removing, setRemoving] = useState<OrgDetail["members"][number] | null>(null);

  if (detail.members.length === 0) return <p className="text-sm text-muted-foreground">No members.</p>;

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Teams</TableHead>
              <TableHead className="text-end">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </TableCell>
                <TableCell>{roleLabel(member.role)}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {member.teamIds
                    .map((id) => teamName.get(id))
                    .filter(Boolean)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!can({ organization: ["manage-members"] })}
                    onClick={() => setRemoving(member)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {detail.organization.name}. Their account stays and they can join another
              organisation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                removing &&
                runMutation("Member removed", () =>
                  removeMember({ memberId: removing.id, memberEmail: removing.email }),
                )
              }
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DangerZone({ org, onDeleted }: { org: OrgDetail["organization"]; onDeleted: () => void }) {
  const { can } = useStaffPermissions();
  const deleteOrganization = useMutation(api.admin.deleteOrganization);
  const [open, setOpen] = useState(false);

  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
      <div>
        <p className="text-sm font-medium">Delete organisation</p>
        <p className="text-sm text-muted-foreground">
          Removes the organisation, its teams and invitations. Member accounts stay.
        </p>
      </div>
      <Button
        variant="destructive"
        size="sm"
        disabled={!can({ organization: ["delete"] })}
        onClick={() => setOpen(true)}
      >
        Delete…
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
            <AlertDialogDescription>This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (await runMutation("Organisation deleted", () => deleteOrganization({ organizationId: org.id })))
                  onDeleted();
              }}
            >
              Delete organisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
