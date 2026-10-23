"use client";

import { AuthProvider as AuthProviderPrimitive } from "@better-auth-ui/react";
import { useQuery } from "convex/react";
import { CopyIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { OrganizationPeople } from "@/components/auth/organization/organization-people";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { authClient } from "@/lib/auth-client";
import { ORG_ROLE_LABELS, type OrgRole, ROLE_LABELS, STAFF_ORG_ROLES, staffRoleForOrgRole } from "@/lib/permissions";
import { formatDate } from "@/lib/sme/format";
import { api } from "../../../convex/_generated/api";
import { AdminPageHeader } from "./page-header";

// The staff organisation uses MASLink's access levels instead of the enterprise roles
const STAFF_ROLE_OPTIONS = Object.fromEntries(
  STAFF_ORG_ROLES.map((role) => [role, ROLE_LABELS[staffRoleForOrgRole(role)].label]),
) as Record<string, string>;
const STAFF_PLUGINS = [organizationPlugin({ roles: STAFF_ROLE_OPTIONS })];

const invitationLink = (id: string) => `${window.location.origin}/auth/accept-invitation?invitationId=${id}`;

export function StaffPeople() {
  const { role } = useStaffPermissions();
  const router = useRouter();
  const staff = useQuery(api.admin.staff);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Staff" />

      <AccessLevels />

      {role === "superadmin" ? (
        // better-auth-ui's people screen, scoped to the staff organisation (every staff session's active org)
        <AuthProviderPrimitive
          authClient={authClient}
          redirectTo="/start"
          navigate={({ to, replace }) => (replace ? router.replace(to) : router.push(to))}
          Link={Link}
          plugins={STAFF_PLUGINS}
        >
          <OrganizationPeople />
        </AuthProviderPrimitive>
      ) : (
        <ReadOnlyStaff staff={staff} />
      )}

      {role === "superadmin" && !!staff?.invitations.length && (
        <Card>
          <CardHeader>
            <CardTitle>Invite links</CardTitle>
            <CardDescription>
              Invitations are emailed, but you can also send the link yourself. They sign in or create an account with
              the invited email, then accept.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border text-sm">
              {staff.invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAFF_ROLE_OPTIONS[invitation.role ?? ""] ?? "Viewer"}, expires{" "}
                      {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(invitationLink(invitation.id))
                        .then(() => toast.success("Invite link copied"))
                    }
                  >
                    <CopyIcon />
                    Copy link
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccessLevels() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {STAFF_ORG_ROLES.map((orgRole) => {
        const level = ROLE_LABELS[staffRoleForOrgRole(orgRole)];
        return (
          <div key={orgRole} className="rounded-xl border bg-card p-4">
            <p className="font-medium">{level.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{level.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyStaff({ staff }: { staff: ReturnType<typeof useQuery<typeof api.admin.staff>> }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Only a super admin can invite staff or change access levels.</p>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Access level</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff === undefined && (
              <TableRow>
                <TableCell colSpan={3}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            )}
            {staff?.members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </TableCell>
                <TableCell>
                  {STAFF_ROLE_OPTIONS[member.role] ?? ORG_ROLE_LABELS[member.role as OrgRole] ?? member.role}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {formatDate(member.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
