import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx, requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import {
  ac,
  ENTERPRISE_ORG_ROLES,
  isStaffRole,
  orgAc,
  orgRoles,
  roles,
  STAFF_ORG_ROLES,
  STAFF_ROLES,
  staffRoleForOrgRole,
} from "../src/lib/permissions";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import {
  sendChangeEmailConfirmation,
  sendEmailVerification,
  sendOrganizationInvitation,
  sendPasswordChanged,
  sendResetPassword,
} from "./email";

const siteUrl = process.env.SITE_URL!;

/** Comma-separated in the Convex environment, e.g. SUPER_ADMIN_EMAILS="a@yeshub.com,b@yeshub.com". */
function superAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  // Locally installed component (convex/betterAuth), so the organization and admin plugins have tables
  local: { schema: authSchema },
});

// Admin endpoints that act on another account, and the audit action each one records
const ADMIN_ACTIONS: Record<string, string> = {
  "/admin/create-user": "user.create",
  "/admin/update-user": "user.update",
  "/admin/set-role": "user.set-role",
  "/admin/set-user-password": "user.set-password",
  "/admin/ban-user": "user.ban",
  "/admin/unban-user": "user.unban",
  "/admin/impersonate-user": "user.impersonate",
  "/admin/revoke-user-session": "user.revoke-session",
  "/admin/revoke-user-sessions": "user.revoke-sessions",
  "/admin/remove-user": "user.delete",
};

// Organisation endpoints that change who's in an organisation or what they can do
const STAFF_MEMBER_ENDPOINTS = new Set([
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/add-member",
]);

// Staff organisation changes and the audit action each one records
const STAFF_ACTIONS: Record<string, string> = {
  "/organization/invite-member": "staff.invite",
  "/organization/cancel-invitation": "staff.cancel-invitation",
  "/organization/update-member-role": "staff.update-role",
  "/organization/remove-member": "staff.remove",
};

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Better Auth options without the instance, so the locally installed component (convex/betterAuth)
 * can read them. Regenerate convex/betterAuth/generatedSchema.ts after changing plugins or fields.
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  // Hooks run in Convex HTTP actions, so they reach app data through internal functions
  const run = () => requireRunMutationCtx(ctx);

  /** Rejects organisation membership that breaks "one organisation per account, never an SME". */
  const assertCanJoinOrganization = async (userId: string, organizationId?: string) => {
    const state = await run().runQuery(internal.platform.accountState, { userId });
    if (state.hasSmeProfile) {
      throw new APIError("BAD_REQUEST", { message: "This is an SME account. Organisations use separate accounts." });
    }
    if (state.organizations.some((org) => org.id !== organizationId)) {
      throw new APIError("BAD_REQUEST", { message: "This account already belongs to an organisation." });
    }
  };

  /** Staff organisation membership grants the matching platform access level. */
  const syncStaffRole = async (userId: string, organizationKind: unknown, orgRole: string | null) => {
    if (organizationKind !== "staff") return;
    await run().runMutation(internal.platform.setPlatformRoleById, { userId, role: staffRoleForOrgRole(orgRole) });
  };

  const findMember = (hookCtx: HookContext, memberId: string) =>
    hookCtx.context.adapter.findOne<{ userId: string; organizationId: string }>({
      model: "member",
      where: [{ field: "id", value: memberId }],
    });

  /** Audit entries for changes to the YES Hub staff organisation (enterprise membership isn't audited). */
  const recordStaffChange = async (hookCtx: HookContext) => {
    const session = hookCtx.context.session ?? (await getSessionFromCtx(hookCtx));
    if (!session) return;
    const body = (hookCtx.body ?? {}) as Record<string, string | undefined>;
    const returned = hookCtx.context.returned as Record<string, unknown> | null;
    // The endpoints return the invitation or member they changed; use it to find the organisation
    const record = (returned?.member ?? returned?.invitation ?? returned) as {
      organizationId?: string;
      email?: string;
      userId?: string;
      role?: string;
    } | null;
    const organizationId = body.organizationId ?? record?.organizationId ?? session.session.activeOrganizationId;
    if (!organizationId) return;
    const org = await hookCtx.context.adapter.findOne<{ kind?: string }>({
      model: "organization",
      where: [{ field: "id", value: organizationId }],
    });
    if (org?.kind !== "staff") return;

    const userId = record?.userId;
    const user = userId ? await hookCtx.context.internalAdapter.findUserById(userId) : null;
    const role = body.role ?? record?.role;
    await run().runMutation(internal.audit.record, {
      actorId: session.user.id,
      actorName: session.user.name,
      action: STAFF_ACTIONS[hookCtx.path],
      targetType: "staff",
      targetId: userId,
      targetLabel: user?.email ?? body.email ?? record?.email ?? body.memberIdOrEmail,
      details: role && hookCtx.path !== "/organization/remove-member" ? `access level: ${role}` : undefined,
    });
  };

  return {
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      // Off until a domain is verified in Resend: onboarding@resend.dev only delivers to the
      // Resend account owner, so nobody else could ever verify. Turn on with sendOnSignUp below.
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPassword(requireActionCtx(ctx), { to: user.email, url });
      },
      onPasswordReset: async ({ user }) => {
        await sendPasswordChanged(requireActionCtx(ctx), { to: user.email });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmailVerification(requireActionCtx(ctx), { to: user.email, url });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        // Confirmation goes to the current address; the new one is then verified
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendChangeEmailConfirmation(requireActionCtx(ctx), {
            to: user.email,
            newEmail,
            url,
          });
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // SUPER_ADMIN_EMAILS sign-ups become owners of the YES Hub staff organisation
          after: async (user) => {
            if (superAdminEmails().includes(user.email.toLowerCase())) {
              await run().runMutation(internal.platform.makeStaffOwner, { userId: user.id });
            }
          },
        },
        delete: {
          // Deleting an account removes its SME profile and uploaded documents too
          after: async (user) => {
            await run().runMutation(internal.platform.deleteAppDataForUser, { userId: user.id });
          },
        },
      },
      session: {
        create: {
          // Every account has at most one organisation: open each session in it
          before: async (session) => {
            const organizationId = await run().runQuery(internal.platform.organizationIdForUser, {
              userId: session.userId,
            });
            return organizationId ? { data: { ...session, activeOrganizationId: organizationId } } : undefined;
          },
        },
      },
    },
    hooks: {
      // Only a super admin may act on another staff account, and nobody changes their own access level
      before: createAuthMiddleware(async (hookCtx) => {
        // Inside the staff organisation, only super admins manage members (enterprise admins can in theirs)
        if (STAFF_MEMBER_ENDPOINTS.has(hookCtx.path)) {
          const session = await getSessionFromCtx(hookCtx);
          const body = (hookCtx.body ?? {}) as { organizationId?: string };
          const organizationId = body.organizationId ?? session?.session.activeOrganizationId;
          if (!organizationId) return;
          const org = await hookCtx.context.adapter.findOne<{ kind?: string }>({
            model: "organization",
            where: [{ field: "id", value: organizationId }],
          });
          if (org?.kind !== "staff") return;
          if (session?.user.role !== "superadmin") {
            throw new APIError("FORBIDDEN", { message: "Only a super admin can manage YES Hub staff." });
          }
          if (hookCtx.path === "/organization/update-member-role") {
            const memberId = (hookCtx.body as { memberId?: string }).memberId;
            const member = memberId ? await findMember(hookCtx, memberId) : null;
            if (member?.userId === session.user.id) {
              throw new APIError("FORBIDDEN", { message: "You can’t change your own access level." });
            }
          }
          return;
        }

        if (!ADMIN_ACTIONS[hookCtx.path] || hookCtx.path === "/admin/create-user") return;
        const targetId = (hookCtx.body as { userId?: string } | undefined)?.userId;
        if (!targetId) return;

        const session = await getSessionFromCtx(hookCtx);
        if (session?.user.id === targetId && hookCtx.path !== "/admin/revoke-user-session") {
          throw new APIError("FORBIDDEN", { message: "You can’t do that to your own account." });
        }
        const target = await hookCtx.context.internalAdapter.findUserById(targetId);
        if (isStaffRole((target as { role?: string } | null)?.role) && session?.user.role !== "superadmin") {
          throw new APIError("FORBIDDEN", { message: "Only a super admin can change another staff account." });
        }
        if (hookCtx.path === "/admin/set-role") {
          // Access levels come from the staff organisation; this endpoint only toggles plain users
          const role = (hookCtx.body as { role?: unknown }).role;
          if (role !== "user") {
            throw new APIError("BAD_REQUEST", { message: "Invite staff through the YES Hub team instead." });
          }
        }
      }),
      // Record every admin action in the audit log
      after: createAuthMiddleware(async (hookCtx) => {
        if (hookCtx.context.returned instanceof Error) return;
        if (STAFF_ACTIONS[hookCtx.path]) return recordStaffChange(hookCtx);
        const action = ADMIN_ACTIONS[hookCtx.path];
        if (!action) return;

        const session = hookCtx.context.session ?? (await getSessionFromCtx(hookCtx));
        if (!session) return;
        const body = (hookCtx.body ?? {}) as Record<string, unknown>;
        const targetId = typeof body.userId === "string" ? body.userId : undefined;
        const target = targetId ? await hookCtx.context.internalAdapter.findUserById(targetId) : null;

        await run().runMutation(internal.audit.record, {
          actorId: session.user.id,
          actorName: session.user.name,
          action,
          targetType: "user",
          targetId,
          targetLabel: target?.email ?? (typeof body.email === "string" ? body.email : undefined),
          details:
            typeof body.banReason === "string"
              ? body.banReason
              : typeof body.role === "string"
                ? `role: ${body.role}`
                : undefined,
        });
      }),
    },
    plugins: [
      // Enterprises (and the YES Hub staff organisation) are organisations with members, teams and invitations
      organization({
        teams: { enabled: true },
        ac: orgAc,
        roles: orgRoles,
        schema: {
          organization: {
            additionalFields: {
              /** "enterprise" (Capitec, Boxer, …) or "staff" (YES Hub itself). Set by the server only. */
              kind: { type: "string", required: false, defaultValue: "enterprise", input: false },
              /** Enterprises can't post opportunities until YES Hub staff verify them. */
              verificationStatus: { type: "string", required: false, defaultValue: "unverified", input: false },
              verifiedAt: { type: "number", required: false, input: false },
              verificationNote: { type: "string", required: false, input: false },
            },
          },
        },
        organizationHooks: {
          beforeCreateOrganization: async ({ user }) => {
            if (isStaffRole(user.role as string)) {
              throw new APIError("BAD_REQUEST", { message: "Staff accounts can’t create organisations." });
            }
            await assertCanJoinOrganization(user.id);
          },
          beforeAddMember: async ({ member, user, organization }) => {
            await assertCanJoinOrganization(user.id, organization.id);
            const allowed = organization.kind === "staff" ? STAFF_ORG_ROLES : ENTERPRISE_ORG_ROLES;
            if (!(allowed as string[]).includes(member.role)) {
              throw new APIError("BAD_REQUEST", { message: `“${member.role}” isn’t a role in this organisation.` });
            }
          },
          beforeCreateInvitation: async ({ invitation, inviter, organization }) => {
            if (organization.kind === "staff") {
              if (inviter.role !== "superadmin") {
                throw new APIError("FORBIDDEN", { message: "Only a super admin can invite YES Hub staff." });
              }
              if (!(STAFF_ORG_ROLES as string[]).includes(invitation.role)) {
                throw new APIError("BAD_REQUEST", { message: "Staff roles are owner, admin, moderator and viewer." });
              }
            } else if (!(ENTERPRISE_ORG_ROLES as string[]).includes(invitation.role)) {
              throw new APIError("BAD_REQUEST", { message: "Organisation roles are owner, admin and member." });
            }
          },
          beforeAcceptInvitation: async ({ user, organization }) => {
            await assertCanJoinOrganization(user.id, organization.id);
          },
          beforeUpdateMemberRole: async ({ newRole, organization }) => {
            const allowed = organization.kind === "staff" ? STAFF_ORG_ROLES : ENTERPRISE_ORG_ROLES;
            if (!(allowed as string[]).includes(newRole)) {
              throw new APIError("BAD_REQUEST", { message: `“${newRole}” isn’t a role in this organisation.` });
            }
          },
          afterAddMember: async ({ member, organization }) => {
            await syncStaffRole(member.userId, organization.kind, member.role);
          },
          afterAcceptInvitation: async ({ member, organization }) => {
            await syncStaffRole(member.userId, organization.kind, member.role);
          },
          afterUpdateMemberRole: async ({ member, organization }) => {
            await syncStaffRole(member.userId, organization.kind, member.role);
          },
          afterRemoveMember: async ({ member, organization }) => {
            await syncStaffRole(member.userId, organization.kind, null);
          },
          beforeDeleteOrganization: async ({ organization }) => {
            if (organization.kind === "staff") {
              throw new APIError("FORBIDDEN", { message: "The YES Hub staff organisation can’t be deleted." });
            }
          },
        },
        sendInvitationEmail: async ({ id, email, organization, inviter }) => {
          await sendOrganizationInvitation(requireActionCtx(ctx), {
            to: email,
            url: `${siteUrl}/auth/accept-invitation?invitationId=${id}`,
            organizationName: organization.name,
            inviterName: inviter.user.name,
            inviterEmail: inviter.user.email,
          });
        },
      }),
      // Platform access levels for YES Hub staff (see src/lib/permissions.ts)
      admin({ ac, roles, adminRoles: STAFF_ROLES, defaultRole: "user" }),
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
