import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { components } from "./_generated/api";
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

/**
 * Better Auth options without the instance, so the locally installed component (convex/betterAuth)
 * can read them. Regenerate convex/betterAuth/generatedSchema.ts after changing plugins or fields.
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
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
          // Accounts created with an email in SUPER_ADMIN_EMAILS become YES Hub admins straight away
          before: async (user) =>
            superAdminEmails().includes(user.email.toLowerCase()) ? { data: { ...user, role: "admin" } } : undefined,
        },
      },
    },
    plugins: [
      // Enterprises and funders are organisations: members with roles, invitations and teams
      organization({
        teams: { enabled: true },
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
      // YES Hub staff: the "admin" role can list, ban and impersonate users
      admin(),
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
