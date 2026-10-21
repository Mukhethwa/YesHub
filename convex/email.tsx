import { Resend } from "@convex-dev/resend";
import {
  ChangeEmailConfirmationEmail,
  EmailVerificationEmail,
  PasswordChangedEmail,
  ResetPasswordEmail,
} from "@better-auth-ui/react/email";
import { render } from "react-email";
import type { ReactElement } from "react";
import { components } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

// Reads RESEND_API_KEY from the Convex deployment's environment.
// testMode defaults to true, which only delivers to @resend.dev addresses.
export const resend = new Resend(components.resend, { testMode: false });

const appName = "YES Hub";

// Must be an address on a domain verified in Resend. The default, onboarding@resend.dev,
// can only deliver to the email address of the Resend account owner.
const from = process.env.AUTH_EMAIL_FROM ?? `${appName} <onboarding@resend.dev>`;

const siteUrl = process.env.SITE_URL!;

// Matches Better Auth's default token lifetimes (1 hour)
const expirationMinutes = 60;

async function send(ctx: ActionCtx, to: string, subject: string, email: ReactElement) {
  await resend.sendEmail(ctx, { from, to, subject, html: await render(email) });
}

export function sendEmailVerification(ctx: ActionCtx, { to, url }: { to: string; url: string }) {
  return send(
    ctx,
    to,
    `Verify your email for ${appName}`,
    <EmailVerificationEmail url={url} email={to} appName={appName} expirationMinutes={expirationMinutes} />,
  );
}

export function sendResetPassword(ctx: ActionCtx, { to, url }: { to: string; url: string }) {
  return send(
    ctx,
    to,
    `Reset your ${appName} password`,
    <ResetPasswordEmail url={url} email={to} appName={appName} expirationMinutes={expirationMinutes} />,
  );
}

export function sendPasswordChanged(ctx: ActionCtx, { to }: { to: string }) {
  return send(
    ctx,
    to,
    `Your ${appName} password was changed`,
    <PasswordChangedEmail
      email={to}
      appName={appName}
      timestamp={new Date().toUTCString()}
      secureAccountURL={`${siteUrl}/auth/forgot-password`}
    />,
  );
}

export function sendChangeEmailConfirmation(
  ctx: ActionCtx,
  { to, newEmail, url }: { to: string; newEmail: string; url: string },
) {
  return send(
    ctx,
    to,
    `Confirm your new ${appName} email address`,
    <ChangeEmailConfirmationEmail
      url={url}
      currentEmail={to}
      newEmail={newEmail}
      appName={appName}
      expirationMinutes={expirationMinutes}
    />,
  );
}
