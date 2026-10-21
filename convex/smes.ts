import { ConvexError } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

async function getOwnSme(ctx: QueryCtx) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  return ctx.db
    .query("smes")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
}

/** The signed-in user's SME profile, or null if they haven't registered one. */
export const current = query({
  args: {},
  handler: async (ctx) => getOwnSme(ctx),
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
    if (sme?.isDemo) await ctx.db.delete(sme._id);
  },
});
