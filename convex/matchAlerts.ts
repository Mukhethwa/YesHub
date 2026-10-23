import { v } from "convex/values";

import { getSettings } from "../src/lib/sme/settings";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { internalMutation, internalQuery } from "./functions";
import { evaluateApplication } from "./lib/evaluation";
import { isNewMatch } from "./lib/matching";

/*
 * WhatsApp alerts for new matches, sent from the WhatsApp Business number PayB4 uses, through Meta's WhatsApp
 * Cloud API. When a listing is published, every SME it matches (lib/matching.ts, the same rules as My matches)
 * that turned on WhatsApp alerts for new matches in Settings gets one message about it.
 *
 * Convex environment variables:
 *   WHATSAPP_PHONE_NUMBER_ID    the sending number's id in Meta (the one PayB4 uses)
 *   WHATSAPP_ACCESS_TOKEN       a token for that number; a permanent System User token is best
 *   WHATSAPP_ALLOWED_NUMBERS    the only numbers that may receive alerts, comma-separated (27821234567). Nothing
 *                               is sent while it's empty, so seeded SMEs' made-up numbers are never messaged.
 *                               "*" allows every SME that turned alerts on.
 *   WHATSAPP_MATCH_TEMPLATE     optional, an approved template. Without it alerts are plain text, which WhatsApp
 *                               only delivers within 24 hours of the person last messaging the number.
 *   WHATSAPP_TEMPLATE_LANGUAGE  optional, default "en"
 *   WHATSAPP_GRAPH_VERSION      optional, default "v18.0", as PayB4 uses
 *
 * Replies to the number still reach PayB4, which owns its webhook.
 */

const SME_LIMIT = 500;

const KIND_NAMES: Record<Doc<"opportunities">["kind"], string> = {
  tender: "tender",
  rfq: "RFQ",
  grant: "grant",
  funding: "funding offer",
  accelerator: "accelerator programme",
  support: "business-support service",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-03" → "3 Nov 2026". */
function readableDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** A South African mobile number as WhatsApp wants it: digits with the country code and no +. */
export function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return `27${digits.slice(1)}`;
  if (/^27\d{9}$/.test(digits)) return digits;
  return null;
}

function allowedNumbers(): Set<string> | "all" {
  const raw = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").trim();
  if (raw === "*") return "all";
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((n) => whatsappNumber(n))
      .filter((n): n is string => !!n),
  );
}

type Listing = {
  id: Id<"opportunities">;
  kind: Doc<"opportunities">["kind"];
  reference: string;
  title: string;
  closesAt: string;
  organizationName: string;
};
type Person = { smeId: Id<"smes">; firstName: string; companyName: string; phone: string };
type Outcome = { status: "sent" | "failed"; messageId?: string; detail?: string };

/** The SMEs a newly published listing should alert, with what their message needs. */
export const recipients = internalQuery({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args): Promise<{ opportunity: Listing; people: Person[] } | null> => {
    const opportunity = await ctx.db.get("opportunities", args.opportunityId);
    if (!opportunity || opportunity.status !== "open") return null;
    const detail = await ctx.runQuery(components.betterAuth.organizations.detail, {
      organizationId: opportunity.organizationId,
    });
    if (detail?.organization.verificationStatus !== "verified") return null;

    const people: Person[] = [];
    for (const sme of await ctx.db.query("smes").take(SME_LIMIT)) {
      if (sme.suspendedAt) continue;
      const settings = getSettings(sme);
      if (!settings.notifyWhatsapp || !settings.alertNewMatches) continue;
      if (!isNewMatch(opportunity, sme, evaluateApplication(opportunity, sme))) continue;

      const [alerts, applied] = await Promise.all([
        ctx.db
          .query("matchAlerts")
          .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id).eq("opportunityId", opportunity._id))
          .take(10),
        ctx.db
          .query("applications")
          .withIndex("by_sme_and_opportunity", (q) => q.eq("smeId", sme._id).eq("opportunityId", opportunity._id))
          .first(),
      ]);
      // Once per SME and listing; a failed send may be tried again
      if (applied || alerts.some((a) => a.status === "sent")) continue;

      people.push({
        smeId: sme._id,
        firstName: sme.contactName.trim().split(/\s+/)[0] || sme.companyName,
        companyName: sme.companyName,
        phone: sme.phone,
      });
    }

    return {
      opportunity: {
        id: opportunity._id,
        kind: opportunity.kind,
        reference: opportunity.reference,
        title: opportunity.title,
        closesAt: opportunity.closesAt,
        organizationName: detail.organization.name,
      },
      people,
    };
  },
});

export const record = internalMutation({
  args: {
    smeId: v.id("smes"),
    opportunityId: v.id("opportunities"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    messageId: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("matchAlerts", { ...args, channel: "whatsapp" });
    return null;
  },
});

function listingLink(listing: Listing) {
  return `${process.env.SITE_URL ?? "https://yeshub-app.vercel.app"}/sme/opportunities?id=${listing.id}`;
}

/** The plain-text alert, for when there's no approved template. */
function alertText(person: Person, listing: Listing) {
  return [
    `Hi ${person.firstName}, a new ${KIND_NAMES[listing.kind]} on MASLink matches ${person.companyName}.`,
    "",
    listing.reference,
    listing.title,
    `${listing.organizationName}, closes ${readableDate(listing.closesAt)}`,
    "",
    `View it and apply: ${listingLink(listing)}`,
  ].join("\n");
}

/** Posts one message to the WhatsApp Cloud API. */
async function postMessage(to: string, message: Record<string, unknown>): Promise<Outcome> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    return { status: "failed", detail: "WhatsApp isn't set up: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN" };
  }
  const version = process.env.WHATSAPP_GRAPH_VERSION || "v18.0";
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...message }),
    });
    const data = (await response.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      return { status: "failed", detail: (data?.error?.message ?? `HTTP ${response.status}`).slice(0, 300) };
    }
    return { status: "sent", messageId: data?.messages?.[0]?.id };
  } catch (error) {
    return { status: "failed", detail: String(error).slice(0, 300) };
  }
}

function matchMessage(person: Person, listing: Listing): Record<string, unknown> {
  const template = process.env.WHATSAPP_MATCH_TEMPLATE;
  if (!template) return { type: "text", text: { preview_url: true, body: alertText(person, listing) } };
  // The template's body takes these, in this order: {{1}} name, {{2}} company, {{3}} reference, {{4}} title,
  // {{5}} buyer, {{6}} closing date, {{7}} link
  const values = [
    person.firstName,
    person.companyName,
    listing.reference,
    listing.title,
    listing.organizationName,
    readableDate(listing.closesAt),
    listingLink(listing),
  ];
  return {
    type: "template",
    template: {
      name: template,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: [{ type: "body", parameters: values.map((text) => ({ type: "text", text })) }],
    },
  };
}

/**
 * Alerts the SMEs a newly published listing matches. Scheduled by publishing (opportunities.ts); safe to run
 * again, since an SME is only alerted once per listing.
 *
 *   pnpm exec convex run matchAlerts:onPublished '{"opportunityId":"..."}'
 */
export const onPublished = internalAction({
  args: { opportunityId: v.id("opportunities") },
  handler: async (ctx, args): Promise<{ sent: number; failed: number; skipped: number }> => {
    const found: { opportunity: Listing; people: Person[] } | null = await ctx.runQuery(
      internal.matchAlerts.recipients,
      args,
    );
    const tally = { sent: 0, failed: 0, skipped: 0 };
    if (!found) return tally;
    const allowed = allowedNumbers();

    for (const person of found.people) {
      const to = whatsappNumber(person.phone);
      if (!to || (allowed !== "all" && !allowed.has(to))) {
        // Not recorded, so the SME is alerted once its number is valid and allowed
        console.log(
          `${found.opportunity.reference}: not alerting ${person.companyName} (${to ? "number not in WHATSAPP_ALLOWED_NUMBERS" : "no valid mobile number"})`,
        );
        tally.skipped++;
        continue;
      }
      const outcome = await postMessage(to, matchMessage(person, found.opportunity));
      await ctx.runMutation(internal.matchAlerts.record, {
        smeId: person.smeId,
        opportunityId: args.opportunityId,
        ...outcome,
      });
      console.log(
        `${found.opportunity.reference}: WhatsApp to ${person.companyName} ${outcome.status}`,
        outcome.detail ?? "",
      );
      tally[outcome.status]++;
    }
    return tally;
  },
});

/**
 * Sends a test message, to check the WhatsApp settings. Only to an allowed number.
 *
 *   pnpm exec convex run matchAlerts:sendTest '{"to":"0821234567"}'
 */
export const sendTest = internalAction({
  args: { to: v.string() },
  handler: async (_ctx, args): Promise<Outcome> => {
    const to = whatsappNumber(args.to);
    const allowed = allowedNumbers();
    if (!to) return { status: "failed", detail: "That isn't a South African mobile number" };
    if (allowed !== "all" && !allowed.has(to)) {
      return { status: "failed", detail: "Add the number to WHATSAPP_ALLOWED_NUMBERS first" };
    }
    return postMessage(to, {
      type: "text",
      text: { body: "MASLink test: WhatsApp match alerts are connected to this number." },
    });
  },
});
