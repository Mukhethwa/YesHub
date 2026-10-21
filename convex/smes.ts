import { ConvexError, v } from "convex/values";
import { DOC_MAX_MB, DOC_MIME_TYPES } from "../src/lib/sme/constants";
import { normaliseDetails, validateProfile } from "../src/lib/sme/validation";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import { type DocKey, type DocRef, type SmeDetails, smeDetails, smeDetailsValidator, smeSettings } from "./schema";

async function getOwnSme(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  return ctx.db
    .query("smes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
}

async function requireOwnSme(ctx: QueryCtx) {
  const sme = await getOwnSme(ctx);
  if (!sme) throw new ConvexError("Register your business first.");
  return sme;
}

/** The signed-in user's SME profile, or null if they haven't registered one. */
export const current = query({
  args: {},
  handler: async (ctx) => getOwnSme(ctx),
});

const docKey = v.union(
  v.literal("bbbeeCertificate"),
  v.literal("taxCertificate"),
  v.literal("cipcCertificate"),
  v.literal("companyProfile"),
  v.literal("csdReport"),
  v.literal("bankLetter"),
  v.literal("coidaLetter"),
  v.literal("proofOfAddress"),
);

/** Required documents can be replaced but not removed. Mirrors `required` in src/lib/sme/documents.ts. */
const REQUIRED_DOCS: DocKey[] = ["bbbeeCertificate", "taxCertificate", "cipcCertificate"];

/** A file the browser has already uploaded to Convex storage. */
const uploadedFile = v.object({ storageId: v.id("_storage"), name: v.string() });

/** Checks an upload against the document rules and turns it into a stored reference. */
async function toDocRef(ctx: MutationCtx, file: { storageId: Id<"_storage">; name: string }): Promise<DocRef> {
  const meta = await ctx.db.system.get("_storage", file.storageId);
  if (!meta) throw new ConvexError(`Couldn’t find the upload for ${file.name}. Please try again.`);

  const problem =
    meta.size > DOC_MAX_MB * 1024 * 1024
      ? `${file.name} is larger than ${DOC_MAX_MB} MB`
      : !DOC_MIME_TYPES.includes(meta.contentType ?? "")
        ? `${file.name} isn’t a PDF, JPG or PNG file`
        : null;
  if (problem) {
    await ctx.storage.delete(file.storageId);
    throw new ConvexError(problem);
  }

  return {
    storageId: file.storageId,
    name: file.name.slice(0, 200),
    size: meta.size,
    type: meta.contentType!,
    uploadedAt: new Date().toISOString(),
  };
}

function firstError(errors: Record<string, string | undefined>) {
  return Object.values(errors).find(Boolean);
}

/** Step 1 of an upload: a short-lived URL the browser POSTs the file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await authComponent.getAuthUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

/** Creates the signed-in user's SME profile from the registration wizard. */
export const register = mutation({
  args: {
    details: smeDetailsValidator,
    documents: v.object({
      bbbeeCertificate: uploadedFile,
      taxCertificate: uploadedFile,
      companyProfile: v.optional(uploadedFile),
    }),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (await getOwnSme(ctx)) throw new ConvexError("You’ve already registered a business.");

    // The contact email is the account's sign-in email
    const details = normaliseDetails({ ...args.details, email: user.email });
    const problem = firstError(
      validateProfile(details, {
        bbbeeCertificate: true,
        taxCertificate: true,
        companyProfile: !!args.documents.companyProfile,
      }),
    );
    if (problem) throw new ConvexError(problem);

    const now = new Date().toISOString();
    return ctx.db.insert("smes", {
      ...details,
      userId: user._id,
      consentedAt: now,
      documents: {
        bbbeeCertificate: await toDocRef(ctx, args.documents.bbbeeCertificate),
        taxCertificate: await toDocRef(ctx, args.documents.taxCertificate),
        companyProfile: args.documents.companyProfile && (await toDocRef(ctx, args.documents.companyProfile)),
      },
    });
  },
});

/** Saves edits from the Business profile page. */
export const update = mutation({
  args: { details: smeDetailsValidator.partial() },
  handler: async (ctx, args) => {
    const sme = await requireOwnSme(ctx);
    const current = Object.fromEntries(
      (Object.keys(smeDetails) as (keyof SmeDetails)[]).map((key) => [key, sme[key]]),
    ) as SmeDetails;
    const details = normaliseDetails({ ...current, ...args.details, email: current.email });

    // Missing certificates are flagged by the readiness score instead of blocking other edits
    const problem = firstError(
      validateProfile(details, {
        bbbeeCertificate: true,
        taxCertificate: true,
        companyProfile: !!sme.documents.companyProfile,
      }),
    );
    if (problem) throw new ConvexError(problem);

    await ctx.db.patch("smes", sme._id, details);
    return null;
  },
});

/** Uploads or replaces one document in the tender pack. */
export const setDocument = mutation({
  args: { key: docKey, file: uploadedFile },
  handler: async (ctx, args) => {
    const sme = await requireOwnSme(ctx);
    const ref = await toDocRef(ctx, args.file);
    const previous = sme.documents[args.key];

    await ctx.db.patch("smes", sme._id, { documents: { ...sme.documents, [args.key]: ref } });
    if (previous?.storageId) await ctx.storage.delete(previous.storageId);
    return null;
  },
});

export const removeDocument = mutation({
  args: { key: docKey },
  handler: async (ctx, args) => {
    const sme = await requireOwnSme(ctx);
    if (REQUIRED_DOCS.includes(args.key)) throw new ConvexError("Required documents can be replaced but not removed.");
    if (args.key === "companyProfile" && !sme.website) {
      throw new ConvexError("Add a website to your profile before removing your company profile.");
    }

    const previous = sme.documents[args.key];
    const documents = { ...sme.documents };
    delete documents[args.key];

    await ctx.db.patch("smes", sme._id, { documents });
    if (previous?.storageId) await ctx.storage.delete(previous.storageId);
    return null;
  },
});

/** Signed download URLs for the signed-in user's documents. */
export const documentUrls = query({
  args: {},
  handler: async (ctx) => {
    const sme = await getOwnSme(ctx);
    const urls: Partial<Record<DocKey, string>> = {};
    if (!sme) return urls;

    for (const [key, doc] of Object.entries(sme.documents) as [DocKey, DocRef | undefined][]) {
      const url = doc?.storageId && (await ctx.storage.getUrl(doc.storageId));
      if (url) urls[key] = url;
    }
    return urls;
  },
});

export const updateSettings = mutation({
  args: { settings: smeSettings },
  handler: async (ctx, args) => {
    const sme = await requireOwnSme(ctx);
    await ctx.db.patch("smes", sme._id, { settings: args.settings });
    return null;
  },
});

async function deleteSme(ctx: MutationCtx, sme: Doc<"smes">) {
  for (const doc of Object.values(sme.documents)) {
    if (doc?.storageId) await ctx.storage.delete(doc.storageId);
  }
  await ctx.db.delete("smes", sme._id);
}

/** Withdraws consent: deletes the business profile and every uploaded document. The account stays. */
export const deleteProfile = mutation({
  args: {},
  handler: async (ctx) => {
    await deleteSme(ctx, await requireOwnSme(ctx));
    return null;
  },
});

// The demo seed only runs against local development sites. Production SITE_URL is https.
function assertDevSite() {
  if (!process.env.SITE_URL?.startsWith("http://localhost")) {
    throw new ConvexError("Sample profiles are only available in development.");
  }
}

function isoDate(daysFromToday: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** Dev only: fills in a sample SME so the dashboard can be seen with data before registration is migrated. */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevSite();
    const user = await authComponent.getAuthUser(ctx);
    if (await getOwnSme(ctx)) throw new ConvexError("You already have a business profile.");

    const now = new Date().toISOString();
    const fakeDoc = (name: string) => ({ name, size: 240_000, type: "application/pdf", uploadedAt: now });

    return ctx.db.insert("smes", {
      userId: user._id,
      isDemo: true,
      consentedAt: now,

      companyName: "Ubuntu Facilities Services",
      registrationNumber: "2019/123456/07",
      csdNumber: "MAAA0123456",
      industry: "Cleaning & Facilities Management",
      yearsTrading: "3–5 years",
      employees: "21–50",
      address: "12 Umgeni Road",
      city: "Durban",
      hqProvince: "KwaZulu-Natal",

      services: ["Office cleaning", "Hygiene services"],
      capabilities: "Daily and deep office cleaning for corporate and public sector clients.",
      accreditations: [],

      nationwide: false,
      provinces: ["KwaZulu-Natal", "Eastern Cape"],
      serviceAreas: ["eThekwini", "Pietermaritzburg"],

      bbbeeLevel: "Level 1",
      bbbeeExpiry: isoDate(200),
      // Lapsed, so the dashboard shows an expired document
      taxExpiry: isoDate(-14),
      website: "",

      contactName: user.name || "Sample Contact",
      contactRole: "Owner / Founder",
      email: user.email,
      phone: "0821234567",

      documents: {
        bbbeeCertificate: fakeDoc("bbbee-affidavit.pdf"),
        taxCertificate: fakeDoc("tax-compliance-status.pdf"),
      },
    });
  },
});

/** Dev only: removes the sample profile created by seedDemo. */
export const clearDemo = mutation({
  args: {},
  handler: async (ctx) => {
    assertDevSite();
    const sme = await getOwnSme(ctx);
    if (sme?.isDemo) await deleteSme(ctx, sme);
    return null;
  },
});
