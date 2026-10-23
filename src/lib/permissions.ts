// MASLink staff access levels. Shared by Better Auth (convex/auth.ts), the Convex admin functions and the
// admin UI, so the same rules apply everywhere. Relative imports only: Convex bundles this file too.
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import {
  adminAc as orgAdminAc,
  defaultStatements as orgStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statements = {
  // Better Auth's own admin resources: user (create, list, set-role, ban, impersonate, …) and session
  ...defaultStatements,
  /** Inviting staff and changing their access level. */
  staff: ["invite", "manage"],
  /** SME profiles. */
  sme: ["read", "verify", "suspend", "delete"],
  /** Enterprise and funder organisations. */
  organization: ["read", "verify", "delete", "manage-members"],
  /** The admin audit log. */
  audit: ["read"],
} as const;

export const ac = createAccessControl(statements);

/** Everything, including managing other staff. */
const superadmin = ac.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "impersonate-admins",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
  staff: ["invite", "manage"],
  sme: ["read", "verify", "suspend", "delete"],
  organization: ["read", "verify", "delete", "manage-members"],
  audit: ["read"],
});

/** Runs the platform day to day, but can't change anyone's access level. */
const admin = ac.newRole({
  user: ["create", "list", "ban", "impersonate", "delete", "set-password", "set-email", "get", "update"],
  session: ["list", "revoke", "delete"],
  sme: ["read", "verify", "suspend", "delete"],
  organization: ["read", "verify", "delete", "manage-members"],
  audit: ["read"],
});

/** Keeps the platform clean: bans, SME review. Can't delete or impersonate. */
const moderator = ac.newRole({
  user: ["list", "get", "ban"],
  session: ["list", "revoke"],
  sme: ["read", "verify", "suspend"],
  organization: ["read", "verify"],
  audit: ["read"],
});

/** Read-only access to the admin area. */
const viewer = ac.newRole({
  user: ["list", "get"],
  session: ["list"],
  sme: ["read"],
  organization: ["read"],
});

/** Everyone who isn't MASLink staff. */
const user = ac.newRole({ user: [], session: [] });

export const roles = { superadmin, admin, moderator, viewer, user };

export type PlatformRole = keyof typeof roles;
export type StaffRole = Exclude<PlatformRole, "user">;

/** Staff roles from most to least access. */
export const STAFF_ROLES: StaffRole[] = ["superadmin", "admin", "moderator", "viewer"];

export const ROLE_LABELS: Record<PlatformRole, { label: string; description: string }> = {
  superadmin: { label: "Super admin", description: "Everything, including inviting staff and changing access levels" },
  admin: { label: "Admin", description: "Manage users, SMEs and organisations; can’t change access levels" },
  moderator: {
    label: "Moderator",
    description: "Ban and unban users, verify SMEs and enterprises; read-only otherwise",
  },
  viewer: { label: "Viewer", description: "Read-only access to the admin area" },
  user: { label: "User", description: "Not MASLink staff" },
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as string[]).includes(role);
}

type Permissions = { [K in keyof typeof statements]?: (typeof statements)[K][number][] };

/** Whether a role has every listed permission. */
export function can(role: string | null | undefined, permissions: Permissions) {
  if (!role || !(role in roles)) return false;
  return roles[role as PlatformRole].authorize(permissions).success;
}

// ---------------------------------------------------------------------------------------------------------
// Organisation roles. Every account belongs to at most one organisation: an enterprise (a company or funder)
// or the MASLink staff organisation. Staff access levels come from the role in the staff organisation.
// ---------------------------------------------------------------------------------------------------------

export const orgAc = createAccessControl(orgStatements);

/** Roles inside any organisation. Moderator and viewer only exist in the staff organisation. */
export const orgRoles = {
  owner: ownerAc,
  admin: orgAdminAc,
  member: memberAc,
  moderator: memberAc,
  viewer: memberAc,
};

export type OrgRole = keyof typeof orgRoles;

export const ENTERPRISE_ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];
export const STAFF_ORG_ROLES: OrgRole[] = ["owner", "admin", "moderator", "viewer"];

/** The MASLink staff organisation. Created on the first super admin's sign-up. */
export const STAFF_ORG_SLUG = "yeshub";

/** A role in the staff organisation grants the matching platform access level. */
export function staffRoleForOrgRole(role: string | null | undefined): StaffRole | "user" {
  switch (role) {
    case "owner":
      return "superadmin";
    case "admin":
    case "moderator":
    case "viewer":
      return role;
    default:
      return "user";
  }
}

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  moderator: "Moderator",
  viewer: "Viewer",
};
