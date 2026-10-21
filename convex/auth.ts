import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import {
  sendChangeEmailConfirmation,
  sendEmailVerification,
  sendPasswordChanged,
  sendResetPassword,
} from "./email";

const siteUrl = process.env.SITE_URL!;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPassword(requireActionCtx(ctx), { to: user.email, url });
      },
      onPasswordReset: async ({ user }) => {
        await sendPasswordChanged(requireActionCtx(ctx), { to: user.email });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in with an unverified email re-sends the verification link
      sendOnSignIn: true,
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
    plugins: [
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
